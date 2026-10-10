-- =====================================================================
-- v14: 点検の対策
--   1) 通報による自動非表示をやめる (捨てアカウント3つで誰でも締め出せたため)。通報は記録だけ。
--      すでに非表示の人・募集は管理画面で戻す (ここでは触らない)
--   2) プッシュ通知の登録先を、各ブラウザのプッシュサーバーだけにする (任意の URL へ送らせない)
--   3) 運営バッジ: profiles.is_staff (user_roles の admin と同期)。管理者以外は「運営」「公式」などを名前に使えない
--   4) private.play_mates_counted に外部キー (募集・アカウントが消えたら一緒に消える)
--   5) 一緒に遊んだ人の自動の通知は30人まで。手動のベルも30人まで (前は200人)
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。
-- =====================================================================

-- 1) ---------------------------------------------------------------------
create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and banned_at is null) then
    raise exception 'このアカウントは現在利用できません' using errcode = '42501';
  end if;
  if p_target_type not in ('user', 'recruitment', 'message') then
    raise exception '通報対象が不正です' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception '通報理由を入力してください' using errcode = '22023';
  end if;

  v_owner := private.target_owner(p_target_type, p_target_id);
  if v_owner is null then
    raise exception '通報対象が見つかりません' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception '自分自身は通報できません' using errcode = '22023';
  end if;
  if p_target_type = 'message' and not private.is_member(
      (select recruitment_id from public.messages where id = p_target_id), v_uid) then
    raise exception '通報対象が見つかりません' using errcode = 'P0002';
  end if;

  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception '通報が多すぎます。時間をおいて再度お試しください' using errcode = 'P0429';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_uid, p_target_type, p_target_id, btrim(p_reason))
  on conflict (reporter_id, target_type, target_id)
  do update set reason = excluded.reason;

  -- v14: 自動では非表示にしない (判断は管理画面で)
  return false;
end;
$$;

-- 2) ---------------------------------------------------------------------
create or replace function private.is_push_endpoint(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and char_length(p) <= 1000 and p ~ (
    '^https://('
    || 'fcm\.googleapis\.com'                       -- Chrome / Edge (Android) / Samsung / Opera
    || '|([a-z0-9-]+\.)*push\.services\.mozilla\.com' -- Firefox
    || '|([a-z0-9-]+\.)*push\.apple\.com'            -- Safari (iPhone / Mac)
    || '|([a-z0-9-]+\.)*notify\.windows\.com'        -- Edge (Windows)
    || ')/'
  );
$$;

delete from public.push_subscriptions where not private.is_push_endpoint(endpoint);
alter table public.push_subscriptions drop constraint if exists push_endpoint_chk;
alter table public.push_subscriptions add constraint push_endpoint_chk check (private.is_push_endpoint(endpoint));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.is_push_endpoint(p_endpoint) then
    raise exception 'この端末では通知を登録できません' using errcode = '22023';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = v_uid) >= 5 then
    delete from public.push_subscriptions where id in (
      select id from public.push_subscriptions where user_id = v_uid order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = v_uid, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- 3) ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_staff boolean not null default false;
update public.profiles p set is_staff = exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin')
  where p.is_staff is distinct from exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin');
grant select (is_staff) on public.profiles to anon;
grant select (is_staff) on public.profiles to authenticated;

create or replace function private.sync_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set is_staff = exists (
    select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'admin'
  ) where id = v_uid;
  return null;
end;
$$;
drop trigger if exists user_roles_sync_staff on public.user_roles;
create trigger user_roles_sync_staff after insert or update or delete on public.user_roles
  for each row execute function private.sync_staff();

-- プロフィールを作るときも、管理者なら印を付ける (user_roles が先にある場合)
create or replace function private.set_staff_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_staff := exists (select 1 from public.user_roles r where r.user_id = new.id and r.role = 'admin');
  return new;
end;
$$;
drop trigger if exists profiles_set_staff on public.profiles;
create trigger profiles_set_staff before insert on public.profiles
  for each row execute function private.set_staff_on_insert();

-- 運営を名乗る名前 (ひらがな・小文字にそろえて、記号を除いてから調べる)
create or replace function private.is_reserved_name(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := private.normalize_for_filter(p);
  t text;
begin
  foreach t in array array[
    '運営', 'うんえい', '公式', 'こうしき', '管理人', '管理者', 'かんりにん', 'かんりしゃ',
    'すたっふ', 'staff', 'admin', 'moderator', 'official', 'joincompass'
  ] loop
    if strpos(n, t) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function private.reject_reserved_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and private.is_reserved_name(new.display_name)
     and not private.is_admin(new.id) then
    raise exception '運営と紛らわしい名前は使えません' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reject_reserved_name on public.profiles;
create trigger profiles_reject_reserved_name before insert or update of display_name on public.profiles
  for each row execute function private.reject_reserved_name();

-- 4) ---------------------------------------------------------------------
delete from private.play_mates_counted c
  where not exists (select 1 from public.recruitments r where r.id = c.recruitment_id)
     or not exists (select 1 from public.profiles p where p.id = c.user_id)
     or not exists (select 1 from public.profiles p where p.id = c.mate_id);
alter table private.play_mates_counted drop constraint if exists play_mates_counted_recruitment_fkey;
alter table private.play_mates_counted drop constraint if exists play_mates_counted_user_fkey;
alter table private.play_mates_counted drop constraint if exists play_mates_counted_mate_fkey;
alter table private.play_mates_counted
  add constraint play_mates_counted_recruitment_fkey foreign key (recruitment_id) references public.recruitments (id) on delete cascade,
  add constraint play_mates_counted_user_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  add constraint play_mates_counted_mate_fkey foreign key (mate_id) references public.profiles (id) on delete cascade;
create index if not exists play_mates_counted_user_idx on private.play_mates_counted (user_id);
create index if not exists play_mates_counted_mate_idx on private.play_mates_counted (mate_id);

-- 5) ---------------------------------------------------------------------
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
      -- いっしょに遊んだ人の募集は、はじめから通知する (止めている人はそのまま)。v14: 通知を受け取る人が30人に達していたら足さない
      if not private.is_blocked_between(new.user_id, m) then
        if (select count(*) from public.follows where follower_id = new.user_id and active) < 30 then
          insert into public.follows (follower_id, followee_id) values (new.user_id, m) on conflict do nothing;
        end if;
        if (select count(*) from public.follows where follower_id = m and active) < 30 then
          insert into public.follows (follower_id, followee_id) values (m, new.user_id) on conflict do nothing;
        end if;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

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
  if p_on
     and not exists (select 1 from public.follows where follower_id = v_uid and followee_id = p_target and active)
     and (select count(*) from public.follows where follower_id = v_uid and active) >= 30 then
    raise exception '通知を受け取れるのは30人までです。ほかの方のベルをオフにしてからお試しください' using errcode = 'P0429';
  end if;
  insert into public.follows (follower_id, followee_id, active) values (v_uid, p_target, p_on)
    on conflict (follower_id, followee_id) do update set active = excluded.active;
end;
$$;
