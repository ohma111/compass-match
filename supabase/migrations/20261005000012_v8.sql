-- v8 (2026-10-05 夜): 運営者の要望。2回流しても壊れない。
--  1) ランクは登録時に聞かず、募集・参加のときに聞く (rank_band を null 可に。募集・参加は rank があるときだけ)
--  2) いっしょに遊んだ人は自動で「募集の通知を受け取る」対象にする。ベルで止めた人は、また遊んでも戻さない
--  3) ブロックしている人が、自分の募集・自分が参加中の募集に参加したら通知する
--  4) 最終利用日 (last_seen_at) を記録し、60日使っていないアカウントを自動で削除する (管理者は除く)
--  5) 保存期間を約1/4に: チャットは終了から90分、募集は15日、通知は7日
--  6) 管理者用: 通報・フィードバックの削除、使っていないアカウントの削除、容量の表に日本語名

-- 1) ---------------------------------------------------------------------
alter table public.profiles alter column rank_band drop not null;

create or replace function private.require_rank(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_uid and rank_band is not null and rank_confirmed) then
    raise exception 'ランクを選んでください' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.check_rank_on_recruit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_rank(new.owner_id);
  return new;
end;
$$;
drop trigger if exists recruitments_require_rank on public.recruitments;
create trigger recruitments_require_rank before insert on public.recruitments
  for each row execute function private.check_rank_on_recruit();

create or replace function private.check_rank_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.status in ('pending', 'approved') and old.status not in ('pending', 'approved')) then
    perform private.require_rank(new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists participations_require_rank on public.participations;
create trigger participations_require_rank before insert or update of status on public.participations
  for each row execute function private.check_rank_on_join();

-- 2) ---------------------------------------------------------------------
alter table public.follows add column if not exists active boolean not null default true;

create or replace function public.set_follow(p_target uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_target is null or p_target = v_uid then
    raise exception '操作できませんでした' using errcode = '22023';
  end if;
  if p_on and private.is_blocked_between(v_uid, p_target) then
    raise exception 'この方の通知は受け取れません' using errcode = '22023';
  end if;
  if p_on and (select count(*) from public.follows where follower_id = v_uid and active) >= 200 then
    raise exception '通知を受け取れるのは200人までです' using errcode = 'P0429';
  end if;
  insert into public.follows (follower_id, followee_id, active) values (v_uid, p_target, p_on)
    on conflict (follower_id, followee_id) do update set active = excluded.active;
end;
$$;

create or replace function private.record_play_mates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;
  for m in
    select r.owner_id from public.recruitments r where r.id = new.recruitment_id
    union
    select pa.user_id from public.participations pa
      where pa.recruitment_id = new.recruitment_id and pa.status = 'approved' and pa.user_id <> new.user_id
  loop
    continue when m = new.user_id;
    if not exists (select 1 from private.play_mates_counted c
                   where c.recruitment_id = new.recruitment_id and c.user_id = new.user_id and c.mate_id = m) then
      insert into private.play_mates_counted values (new.recruitment_id, new.user_id, m), (new.recruitment_id, m, new.user_id)
        on conflict do nothing;
      insert into public.play_mates as pm (user_id, mate_id) values (new.user_id, m), (m, new.user_id)
        on conflict (user_id, mate_id) do update set times = pm.times + 1, last_played_at = now();
      -- いっしょに遊んだ人の募集は、はじめから通知する (止めている人はそのまま)
      if not private.is_blocked_between(new.user_id, m) then
        insert into public.follows (follower_id, followee_id) values (new.user_id, m), (m, new.user_id)
          on conflict do nothing;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

-- これまでに遊んだ人も通知の対象にする
insert into public.follows (follower_id, followee_id)
select pm.user_id, pm.mate_id from public.play_mates pm
where not private.is_blocked_between(pm.user_id, pm.mate_id)
on conflict do nothing;

create or replace function private.notify_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, recruitment_id)
  select f.follower_id, 'followed_posted', new.id
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = new.owner_id
    and f.active
    and p.banned_at is null
    and not private.is_blocked_between(f.follower_id, new.owner_id);
  return new;
end;
$$;

-- 3) ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined'
));

create or replace function private.notify_blocked_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;
  insert into public.notifications (user_id, kind, recruitment_id)
  select b.blocker_id, 'blocked_joined', new.recruitment_id
  from public.blocks b
  where b.blocked_id = new.user_id
    and b.blocker_id in (
      select r.owner_id from public.recruitments r where r.id = new.recruitment_id
      union
      select pa.user_id from public.participations pa
        where pa.recruitment_id = new.recruitment_id and pa.status = 'approved' and pa.user_id <> new.user_id
    );
  return new;
end;
$$;
drop trigger if exists participations_notify_blocked on public.participations;
create trigger participations_notify_blocked after insert or update of status on public.participations
  for each row execute function private.notify_blocked_joined();

-- 表示中の募集のうち、自分がブロックしている人が募集者か参加確定者になっているもの
create or replace function public.recruitments_with_blocked(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.id
  from public.recruitments r
  left join public.participations pa on pa.recruitment_id = r.id and pa.status = 'approved'
  join public.blocks b on b.blocker_id = auth.uid() and (b.blocked_id = pa.user_id or b.blocked_id = r.owner_id)
  where r.id = any (p_ids);
$$;
revoke execute on function public.recruitments_with_blocked(uuid[]) from public, anon;
grant execute on function public.recruitments_with_blocked(uuid[]) to authenticated;

-- 4) ---------------------------------------------------------------------
alter table public.profiles add column if not exists last_seen_at timestamptz not null default now();

-- ページを開いたときに呼ぶ。12時間に1回だけ書く
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
  where id = auth.uid() and last_seen_at < now() - interval '12 hours';
$$;
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

insert into public.app_settings (key, value) values ('inactive_delete_days', '60') on conflict (key) do nothing;

create or replace function private.inactive_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.last_seen_at < now() - make_interval(days => private.setting_int('inactive_delete_days', 60))
    and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'admin')
    and not exists (select 1 from public.recruitments r where r.owner_id = p.id and r.status in ('open', 'full') and r.ends_at > now());
$$;

-- 5) ---------------------------------------------------------------------
insert into public.app_settings (key, value) values ('chat_retention_minutes', '90') on conflict (key) do nothing;
update public.app_settings set value = '15' where key = 'recruitment_retention_days' and value = '60';
insert into public.app_settings (key, value) values ('notification_retention_days', '7') on conflict (key) do nothing;

create or replace function private.chat_available(p_recruitment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recruitments r
    where r.id = p_recruitment_id
      and r.ends_at + make_interval(mins => private.setting_int('chat_retention_minutes', 90)) > now()
  );
$$;

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

  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  exception when others then
    null;
  end;
end;
$$;
revoke execute on function private.run_maintenance() from public, anon, authenticated;
grant execute on function private.run_maintenance() to service_role;

-- 6) ---------------------------------------------------------------------
-- 通報を消す: 対象を指定すればその対象の通報だけ、指定しなければ処理済み (resolved) か全部
create or replace function public.admin_delete_reports(p_target_type text default null, p_target_id uuid default null, p_resolved_only boolean default true)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_admin();
  if p_target_id is not null then
    delete from public.reports where target_type = p_target_type and target_id = p_target_id;
  else
    delete from public.reports where (not p_resolved_only or resolved_at is not null);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_delete_reports(text, uuid, boolean) from public, anon;
grant execute on function public.admin_delete_reports(text, uuid, boolean) to authenticated;

create or replace function public.admin_delete_feedback(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_admin();
  if p_ids is null then
    delete from public.feedback;
  else
    delete from public.feedback where id = any (p_ids);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_delete_feedback(uuid[]) from public, anon;
grant execute on function public.admin_delete_feedback(uuid[]) to authenticated;

create or replace function public.admin_inactive_users()
returns table (id uuid, display_name text, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.display_name, p.last_seen_at from public.profiles p
    where p.id in (select private.inactive_user_ids())
    order by p.last_seen_at
    limit 200;
end;
$$;
revoke execute on function public.admin_inactive_users() from public, anon;
grant execute on function public.admin_inactive_users() to authenticated;

create or replace function public.admin_delete_inactive_users()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_admin();
  delete from auth.users u where u.id in (select private.inactive_user_ids());
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_delete_inactive_users() from public, anon;
grant execute on function public.admin_delete_inactive_users() to authenticated;

-- 古いデータを今すぐ片付ける (自動の片付けを手で走らせる)
create or replace function public.admin_run_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.run_maintenance();
end;
$$;
revoke execute on function public.admin_run_cleanup() from public, anon;
grant execute on function public.admin_run_cleanup() to authenticated;

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
          'name', n.nspname || '.' || c.relname,
          'bytes', pg_total_relation_size(c.oid),
          'rows', c.reltuples::bigint
        ) as t
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname in ('public', 'auth', 'cron', 'private')
        order by pg_total_relation_size(c.oid) desc
        limit 10) x), '[]'::jsonb),
    'auth_users', (select count(*) from auth.users),
    'anonymous_users', (select count(*) from auth.users where is_anonymous),
    'inactive_users', (select count(*) from private.inactive_user_ids()),
    'recruitments', (select count(*) from public.recruitments),
    'messages', (select count(*) from public.messages),
    'notifications', (select count(*) from public.notifications),
    'reports', (select count(*) from public.reports),
    'feedback', (select count(*) from public.feedback)
  ) into v;
  return v;
end;
$$;
