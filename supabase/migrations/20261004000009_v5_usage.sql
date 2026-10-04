-- v5: 無料枠を超えないための片付けと、使用量の確認。2回流しても壊れない。
--  1) 未ログインの閲覧者にも募集者のロール(席に出すアイコン)を見せる
--  2) 定期メンテナンスに、古いデータの削除を足す
--     - 終わって 60 日 (app_settings.recruitment_retention_days) を過ぎた募集 (参加・部屋番号・チャット・通知も一緒に消える)
--       ただし、未処理の通報がある募集は残す
--     - 30 日を過ぎた通知 (既読・未読とも)
--     - プロフィールを作らずに 3 日たった匿名アカウント (シートを開いて閉じただけの人)
--     - pg_cron の実行記録 (5分ごとに1行増える) の 7 日より前
--  3) 管理画面用: データベースの容量と行数

-- 1) ---------------------------------------------------------------------
grant select (play_roles) on public.profiles to anon;

-- 2) ---------------------------------------------------------------------
insert into public.app_settings (key, value)
  values ('recruitment_retention_days', '60')
  on conflict (key) do nothing;

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
      and r.ends_at + make_interval(hours => private.setting_int('chat_retention_hours', 6)) <= now();

  -- 取り消された募集のチャットも同様に削除
  delete from public.messages m
    using public.recruitments r
    where m.recruitment_id = r.id and r.status = 'cancelled'
      and r.cancelled_at + make_interval(hours => private.setting_int('chat_retention_hours', 6)) <= now();

  delete from public.presence_now where expires_at <= now();

  -- v5: 通知は30日で消す (チャットの通知で一番増えるため、既読かどうかは問わない)
  delete from public.notifications where created_at < now() - interval '30 days';

  -- v5: 終わってから一定日数たった募集 (参加・部屋番号・チャット・通知は on delete cascade で消える)
  delete from public.recruitments r
    where least(r.ends_at, coalesce(r.cancelled_at, r.ends_at))
          + make_interval(days => private.setting_int('recruitment_retention_days', 60)) <= now()
      and not exists (
        select 1 from public.reports rp
        where rp.target_type = 'recruitment' and rp.target_id = r.id and rp.resolved_at is null
      );

  -- v5: プロフィールを作らないまま3日たった匿名アカウント
  delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - interval '3 days'
      and not exists (select 1 from public.profiles p where p.id = u.id);

  -- v5: pg_cron の実行記録 (無い環境・権限が無い環境では何もしない)
  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  exception when others then
    null;
  end;
end;
$$;

revoke execute on function private.run_maintenance() from public, anon, authenticated;
grant execute on function private.run_maintenance() to service_role;

-- 3) ---------------------------------------------------------------------
create or replace function public.admin_usage()
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
    'tables', coalesce((select jsonb_agg(t order by (t->>'bytes')::bigint desc) from (
        select jsonb_build_object(
          'name', c.relname,
          'bytes', pg_total_relation_size(c.oid),
          'rows', c.reltuples::bigint
        ) as t
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname in ('public', 'auth', 'cron', 'private')
        order by pg_total_relation_size(c.oid) desc
        limit 8) x), '[]'::jsonb),
    'auth_users', (select count(*) from auth.users),
    'anonymous_users', (select count(*) from auth.users where is_anonymous),
    'recruitments', (select count(*) from public.recruitments),
    'messages', (select count(*) from public.messages),
    'notifications', (select count(*) from public.notifications)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;
