-- v9 (2026-10-05 夜): 運営者の要望。2回流しても壊れない。
--  1) 運営者の Discord アカウントは、どの削除・BAN の対象にもならない (auth.users / profiles の削除を行ごと止める)
--  2) 「最終利用」はページを見た時刻ではなく、募集・参加・チャット・プロフィール変更・引き継ぎコード作成などの操作の時刻
--  3) 満員になったら募集者と参加者に通知 (filled)。お知らせ配信 (announcement) 用に通知へ本文を追加
--  4) 部屋番号は4桁の数字だけ
--  5) 利用停止 (suspend) をやめ、BAN と削除に整理
--  6) メンテナンスモード (手動の切り替えと、期間の予約)
--  7) 募集の集計: 募集を消す前に日ごとの件数を残し、管理画面で期間を選んで種別ごとに見られるようにする。募集ログの削除

-- 1) ---------------------------------------------------------------------
create table if not exists private.protected_users (
  user_id uuid primary key,
  note text not null default ''
);
alter table private.protected_users enable row level security;
insert into private.protected_users (user_id, note)
values ('a785dedf-d035-424b-ae1c-16c9f61d37d1', '運営者の Discord アカウント (絶対に消さない)')
on conflict (user_id) do nothing;

create or replace function private.is_protected(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from private.protected_users where user_id = p_uid); $$;

-- 削除しようとした行が守る対象なら、その行だけ黙って残す (まとめて消す処理は止めない)
create or replace function private.keep_protected_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_protected(old.id) then
    return null;
  end if;
  return old;
end;
$$;
drop trigger if exists users_keep_protected on auth.users;
create trigger users_keep_protected before delete on auth.users
  for each row execute function private.keep_protected_row();
drop trigger if exists profiles_keep_protected on public.profiles;
create trigger profiles_keep_protected before delete on public.profiles
  for each row execute function private.keep_protected_row();

create or replace function private.inactive_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.last_seen_at < now() - make_interval(days => private.setting_int('inactive_delete_days', 60))
    and not private.is_protected(p.id)
    and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'admin')
    and not exists (select 1 from public.recruitments r where r.owner_id = p.id and r.status in ('open', 'full') and r.ends_at > now());
$$;

-- 2) ---------------------------------------------------------------------
-- 操作した本人 (auth.uid()) の最終利用を更新する。10分に1回まで。定期処理など本人がいない操作では何もしない
create or replace function private.touch_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    update public.profiles set last_seen_at = now()
      where id = auth.uid() and last_seen_at < now() - interval '10 minutes';
  end if;
  return null;
end;
$$;

drop trigger if exists recruitments_touch_activity on public.recruitments;
create trigger recruitments_touch_activity after insert or update on public.recruitments
  for each row execute function private.touch_activity();
drop trigger if exists participations_touch_activity on public.participations;
create trigger participations_touch_activity after insert or update on public.participations
  for each row execute function private.touch_activity();
drop trigger if exists messages_touch_activity on public.messages;
create trigger messages_touch_activity after insert on public.messages
  for each row execute function private.touch_activity();
drop trigger if exists follows_touch_activity on public.follows;
create trigger follows_touch_activity after insert or update on public.follows
  for each row execute function private.touch_activity();
drop trigger if exists blocks_touch_activity on public.blocks;
create trigger blocks_touch_activity after insert or delete on public.blocks
  for each row execute function private.touch_activity();
drop trigger if exists reports_touch_activity on public.reports;
create trigger reports_touch_activity after insert on public.reports
  for each row execute function private.touch_activity();
drop trigger if exists feedback_touch_activity on public.feedback;
create trigger feedback_touch_activity after insert on public.feedback
  for each row execute function private.touch_activity();
drop trigger if exists notifications_touch_activity on public.notifications;
create trigger notifications_touch_activity after update or delete on public.notifications
  for each row execute function private.touch_activity();
drop trigger if exists push_touch_activity on public.push_subscriptions;
create trigger push_touch_activity after insert on public.push_subscriptions
  for each row execute function private.touch_activity();

-- プロフィールを自分で変えたとき
create or replace function private.touch_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = new.id then
    new.last_seen_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_touch_activity on public.profiles;
create trigger profiles_touch_activity before update on public.profiles
  for each row execute function private.touch_profile_activity();

-- 引き継ぎコードの作成・引き継ぎはアプリから呼ぶ (ページを見ただけでは呼ばない)
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- 3) ---------------------------------------------------------------------
alter table public.notifications add column if not exists body text;
alter table public.notifications drop constraint if exists notifications_body_chk;
alter table public.notifications add constraint notifications_body_chk check (body is null or char_length(body) <= 300);
alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement'
));

create or replace function private.notify_filled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'full' and old.status is distinct from 'full' then
    insert into public.notifications (user_id, kind, recruitment_id)
    select new.owner_id, 'filled', new.id
    union
    select pa.user_id, 'filled', new.id from public.participations pa
      where pa.recruitment_id = new.id and pa.status = 'approved';
  end if;
  return null;
end;
$$;
drop trigger if exists recruitments_notify_filled on public.recruitments;
create trigger recruitments_notify_filled after update of status on public.recruitments
  for each row execute function private.notify_filled();

-- 4) ---------------------------------------------------------------------
alter table public.recruitment_secrets drop constraint if exists secrets_room_code_chk;
alter table public.recruitment_secrets add constraint secrets_room_code_chk
  check (room_code is null or room_code ~ '^[0-9]{4}$') not valid;

create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_code text := nullif(btrim(p_room_code), '');
begin
  if not private.is_owner(p_recruitment_id, v_uid) then
    raise exception '募集者のみ変更できます' using errcode = '42501';
  end if;
  if v_code is not null and v_code !~ '^[0-9]{4}$' then
    raise exception '部屋番号は4桁の数字で入力してください' using errcode = '22023';
  end if;
  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (p_recruitment_id, v_code)
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_at = now();
end;
$$;

-- 5) ---------------------------------------------------------------------
update public.profiles set banned_at = coalesce(banned_at, suspended_at), suspended_at = null
  where suspended_at is not null;

-- action: ban / restore (suspend は ban と同じ扱い)
create or replace function public.admin_set_user_state(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() or private.is_protected(p_user) or private.is_admin(p_user) then
    raise exception 'このアカウントは操作できません' using errcode = '22023';
  end if;
  if p_action in ('ban', 'suspend') then
    update public.profiles set banned_at = now(), suspended_at = null where id = p_user;
    delete from public.presence_now where user_id = p_user;
    update public.recruitments set status = 'cancelled', cancelled_at = now()
      where owner_id = p_user and status in ('open', 'full') and ends_at > now();
  elsif p_action = 'restore' then
    update public.profiles set suspended_at = null, banned_at = null, hidden_at = null where id = p_user;
    update public.reports set resolved_at = now()
      where target_type = 'user' and target_id = p_user and resolved_at is null;
  else
    raise exception '操作できませんでした' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() or private.is_protected(p_user) or private.is_admin(p_user) then
    raise exception 'このアカウントは削除できません' using errcode = '22023';
  end if;
  delete from auth.users where id = p_user;
  update public.reports set resolved_at = now()
    where target_type = 'user' and target_id = p_user and resolved_at is null;
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 6) ---------------------------------------------------------------------
create table if not exists public.site_maintenance (
  id         boolean primary key default true,
  manual_on  boolean not null default false,
  starts_at  timestamptz,
  ends_at    timestamptz,
  message    text not null default '',
  updated_at timestamptz not null default now(),
  constraint site_maintenance_one_row check (id),
  constraint site_maintenance_message_chk check (char_length(message) <= 200),
  constraint site_maintenance_period_chk check (starts_at is null or ends_at is null or ends_at > starts_at)
);
alter table public.site_maintenance enable row level security;
insert into public.site_maintenance (id) values (true) on conflict (id) do nothing;

create or replace function private.maintenance_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.manual_on or (m.starts_at is not null and m.ends_at is not null and now() >= m.starts_at and now() < m.ends_at)
    from public.site_maintenance m where m.id
  ), false);
$$;

-- 画面の出し分け用 (誰でも読める)
create or replace function public.site_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', private.maintenance_active(),
    'manual_on', m.manual_on,
    'starts_at', m.starts_at,
    'ends_at', m.ends_at,
    'message', m.message
  ) from public.site_maintenance m where m.id;
$$;
grant execute on function public.site_status() to anon, authenticated;

create or replace function public.admin_set_maintenance(p_manual_on boolean, p_starts_at timestamptz, p_ends_at timestamptz, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception '終了は開始より後にしてください' using errcode = '22023';
  end if;
  update public.site_maintenance set
    manual_on = coalesce(p_manual_on, false),
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    message = left(coalesce(btrim(p_message), ''), 200),
    updated_at = now()
  where id;
end;
$$;
revoke execute on function public.admin_set_maintenance(boolean, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean, timestamptz, timestamptz, text) to authenticated;

-- お知らせを全員の通知欄に配信する (BAN された人を除く)
create or replace function public.admin_announce(p_body text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_admin();
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(btrim(p_body)) > 300 then
    raise exception 'お知らせは1〜300文字で入力してください' using errcode = '22023';
  end if;
  insert into public.notifications (user_id, kind, body)
  select p.id, 'announcement', btrim(p_body) from public.profiles p where p.banned_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_announce(text) from public, anon;
grant execute on function public.admin_announce(text) to authenticated;

-- 書き込みの入口: メンテナンス中は管理者以外を止める
create or replace function private.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if not private.is_active_user(v_uid) then
    raise exception 'このアカウントは現在利用できません' using errcode = '42501';
  end if;
  if private.maintenance_active() and not private.is_admin(v_uid) then
    raise exception 'メンテナンス中のため、現在は利用できません' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- 7) ---------------------------------------------------------------------
create table if not exists public.recruitment_stats_daily (
  day     date not null,
  purpose text not null,
  stance  text not null default '',
  outcome text not null,
  src     text not null default '',
  n       int not null default 0,
  primary key (day, purpose, stance, outcome, src)
);
alter table public.recruitment_stats_daily enable row level security;

-- 募集の結果: active (まだ終わっていない) / filled (満員になった) / unfilled (埋まらず終了) / cancelled (取り消し)
create or replace function private.recruitment_outcome(p_status text, p_filled_at timestamptz, p_ends_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when p_status in ('open', 'full') and p_ends_at > now() then 'active'
    when p_filled_at is not null or p_status = 'full' then 'filled'
    else 'unfilled'
  end;
$$;

-- 募集を消す前に、日ごとの件数へ足しておく (自動の削除・管理者の削除・アカウント削除のどれでも)
create or replace function private.archive_recruitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := private.recruitment_outcome(old.status, old.filled_at, old.ends_at);
begin
  insert into public.recruitment_stats_daily as s (day, purpose, stance, outcome, src, n)
  values (
    (old.starts_at at time zone 'Asia/Tokyo')::date, old.purpose, coalesce(old.stance, ''),
    case when v_outcome = 'active' then 'removed' else v_outcome end, coalesce(old.src, ''), 1
  )
  on conflict (day, purpose, stance, outcome, src) do update set n = s.n + 1;
  return old;
end;
$$;
drop trigger if exists recruitments_archive on public.recruitments;
create trigger recruitments_archive before delete on public.recruitments
  for each row execute function private.archive_recruitment();

create or replace function public.admin_recruitment_stats(p_from date, p_to date)
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
  with live as (
    select (r.starts_at at time zone 'Asia/Tokyo')::date as day, r.purpose, coalesce(r.stance, '') as stance,
           private.recruitment_outcome(r.status, r.filled_at, r.ends_at) as outcome, coalesce(r.src, '') as src, 1 as n
    from public.recruitments r
    where (r.starts_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  ), arch as (
    select s.day, s.purpose, s.stance, s.outcome, s.src, s.n from public.recruitment_stats_daily s
    where s.day between p_from and p_to
  ), allr as (
    select * from live union all select * from arch
  )
  select jsonb_build_object(
    'total', coalesce((select sum(n) from allr), 0),
    'live', (select count(*) from live),
    'archived', coalesce((select sum(n) from arch), 0),
    'purpose', coalesce((select jsonb_object_agg(k, c) from (select purpose as k, sum(n) as c from allr group by 1) x), '{}'::jsonb),
    'stance', coalesce((select jsonb_object_agg(k, c) from (select stance as k, sum(n) as c from allr group by 1) x), '{}'::jsonb),
    'outcome', coalesce((select jsonb_object_agg(k, c) from (select outcome as k, sum(n) as c from allr group by 1) x), '{}'::jsonb),
    'src', coalesce((select jsonb_object_agg(k, c) from (select src as k, sum(n) as c from allr group by 1) x), '{}'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', c) order by day) from (select day, sum(n) as c from allr group by 1) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.admin_recruitment_stats(date, date) from public, anon;
grant execute on function public.admin_recruitment_stats(date, date) to authenticated;

-- 期間内の終わった募集を消す。件数の集計は残す (p_with_stats = true なら集計も消す)
create or replace function public.admin_delete_recruitment_logs(p_from date, p_to date, p_with_stats boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_admin();
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '期間を選び直してください' using errcode = '22023';
  end if;
  delete from public.recruitments r
    where (r.starts_at at time zone 'Asia/Tokyo')::date between p_from and p_to
      and (r.status in ('ended', 'cancelled') or r.ends_at <= now());
  get diagnostics n = row_count;
  if p_with_stats then
    delete from public.recruitment_stats_daily where day between p_from and p_to;
  end if;
  return n;
end;
$$;
revoke execute on function public.admin_delete_recruitment_logs(date, date, boolean) from public, anon;
grant execute on function public.admin_delete_recruitment_logs(date, date, boolean) to authenticated;
