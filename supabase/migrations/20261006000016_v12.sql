-- v12 (2026-10-06 夕): 運営者の要望。2回流しても壊れない。
--  1) 管理画面: ユーザー一覧を10件ずつのページで (最終操作・匿名かどうかも返す)
--  2) 一緒に遊んだ人は新しい10人だけ残す (定期処理で古い記録を消す)
--  3) 容量: 消したデータの分だけ実際にファイルを小さくする (VACUUM FULL を pg_cron で1回だけ実行) と、今の容量を軽く取る関数

-- 1) ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_q text default '', p_page int default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_page int := greatest(coalesce(p_page, 1), 1);
  v jsonb;
begin
  perform private.require_admin();
  with base as (
    select p.id, p.display_name, p.rank_band, p.avatar, p.banned_at, p.hidden_at, p.created_at, p.last_seen_at,
           coalesce(u.is_anonymous, false) as is_anonymous,
           exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin') as is_admin
    from public.profiles p
    left join auth.users u on u.id = p.id
    where v_q = ''
       or p.id::text = v_q
       or p.display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'page', v_page,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select * from base order by created_at desc offset (v_page - 1) * 10 limit 10) x
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.admin_list_users(text, int) from public, anon;
grant execute on function public.admin_list_users(text, int) to authenticated;

-- 3) ---------------------------------------------------------------------
create or replace function public.admin_db_size()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'at', now(),
    'compact_scheduled', exists (select 1 from cron.job where jobname = 'admin-compact')
  ) into v;
  return v;
end;
$$;
revoke execute on function public.admin_db_size() from public, anon;
grant execute on function public.admin_db_size() to authenticated;

-- 削除で空いた場所はそのままではファイルが小さくならない (Postgres の仕組み)。
-- 関数の中では VACUUM できないので、pg_cron に1分後の1回だけの実行を予約する (定期処理が終わったら予約を外す)
create or replace function public.admin_compact()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  begin
    perform cron.unschedule('admin-compact');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'admin-compact',
    '* * * * *',
    'VACUUM FULL public.messages, public.notifications, public.recruitments, public.participations, public.recruitment_secrets, public.reports, public.feedback, public.play_mates, public.follows, public.presence_now, public.push_subscriptions, public.recruitment_stats_daily'
  );
end;
$$;
revoke execute on function public.admin_compact() from public, anon;
grant execute on function public.admin_compact() to authenticated;

-- 2) と 3) の後片付けを定期処理に足す ---------------------------------------
create or replace function private.run_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recruitments set status = 'ended'
    where status in ('open', 'full') and ends_at <= now();

  delete from public.messages m
    using public.recruitments r
    where m.recruitment_id = r.id
      and r.ends_at + make_interval(mins => private.setting_int('chat_retention_minutes', 90)) <= now();

  delete from public.messages m
    using public.recruitments r
    where m.recruitment_id = r.id and r.status = 'cancelled'
      and r.cancelled_at + make_interval(mins => private.setting_int('chat_retention_minutes', 90)) <= now();

  delete from public.presence_now where expires_at <= now();

  delete from public.notifications
    where created_at < now() - make_interval(days => private.setting_int('notification_retention_days', 7));

  delete from public.recruitments r
    where least(r.ends_at, coalesce(r.cancelled_at, r.ends_at))
          + make_interval(days => private.setting_int('recruitment_retention_days', 15)) <= now()
      and not exists (
        select 1 from public.reports rp
        where rp.target_type = 'recruitment' and rp.target_id = r.id and rp.resolved_at is null
      );

  delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - interval '3 days'
      and not exists (select 1 from public.profiles p where p.id = u.id);

  -- v8: 長く使われていないアカウント
  delete from auth.users u where u.id in (select private.inactive_user_ids());

  -- v12: 一緒に遊んだ人は、新しい10人だけ残す (通知のベルは follows に残る)
  delete from public.play_mates pm
    using (
      select user_id, mate_id, row_number() over (partition by user_id order by last_played_at desc) as rn
      from public.play_mates
    ) x
    where pm.user_id = x.user_id and pm.mate_id = x.mate_id and x.rn > 10;

  -- v12: 管理画面の「容量を詰める」(VACUUM FULL) の予約は、1回終わったら外す
  begin
    if exists (
      select 1 from cron.job j join cron.job_run_details d on d.jobid = j.jobid
      where j.jobname = 'admin-compact' and d.status = 'succeeded'
    ) then
      perform cron.unschedule('admin-compact');
    end if;
  exception when others then
    null;
  end;

  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  exception when others then
    null;
  end;
end;
$$;
