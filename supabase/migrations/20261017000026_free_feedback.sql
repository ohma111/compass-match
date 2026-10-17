-- =====================================================================
-- v18 (2026-10-17): 無料の改修。2回流しても壊れない。migration 25 のあとに流す。
--   A) VC に「聞き専OK」(listen)
--   B) 垢レベル (自己申告)
--   D) 募集者の交代 (leave_recruitment_as_owner)
--   E) 終了10分前の予告 (ending_soon)
--   F) 終了後10分間のお礼 (メンバーだけ書き込める)
-- SQL Editor に貼って1回実行する。
-- =====================================================================

-- A) ---------------------------------------------------------------------
alter table public.recruitments drop constraint if exists recruitments_vc_chk;
alter table public.recruitments add constraint recruitments_vc_chk check (vc in ('on', 'listen', 'any', 'off'));

-- B) ---------------------------------------------------------------------
alter table public.profiles add column if not exists account_level smallint;
alter table public.profiles add column if not exists account_level_updated_at timestamptz;
alter table public.profiles drop constraint if exists profiles_account_level_chk;
alter table public.profiles add constraint profiles_account_level_chk check (account_level is null or account_level between 1 and 999);

-- profiles は列ごとの権限。アプリが読む列 (src/lib/profile-columns.ts) に合わせて付ける。未ログインの方には見せない
grant select (account_level, account_level_updated_at) on public.profiles to authenticated;

-- 空 (null) で消す。値が変わったときだけ更新日を動かす
create or replace function public.set_my_account_level(p_level int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_level is not null and p_level not between 1 and 999 then
    raise exception '垢レベルは1〜999の数字で入力してください' using errcode = '22023';
  end if;
  update public.profiles
    set account_level = p_level,
        account_level_updated_at = case when p_level is null then null else now() end
    where id = v_uid and account_level is distinct from p_level;
end;
$$;
revoke execute on function public.set_my_account_level(int) from public, anon;
grant execute on function public.set_my_account_level(int) to authenticated;

-- D) E) 通知の種類 ------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code', 'starting', 'auto_closed', 'close_check',
  'owner_changed', 'became_owner', 'ending_soon'
));

-- D) 募集者の交代 -----------------------------------------------------------
-- 参加確定の方がいなければ「募集を取り消す」と同じ。いれば、一番早く確定した方 (BAN・非表示を除く) が募集者になる。
-- 新しい募集者の参加の行は cancelled にして席の数え方 (approved_count = 募集者以外の参加確定の人数) を保つ。
-- 募集者だけを表す列 (owner_roles・デキレ・コラボ数と、それに対する参加の条件) は新しい募集者に合わないので空にする。
create or replace function public.leave_recruitment_as_owner(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  p record;
  v_new uuid;
  v_new_part uuid;
  v_count int;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) in ('ended', 'cancelled') then
    raise exception 'この募集はすでに終了しています' using errcode = '22023';
  end if;

  select pa.user_id, pa.id into v_new, v_new_part
  from public.participations pa
  where pa.recruitment_id = r.id and pa.status = 'approved' and private.is_active_user(pa.user_id)
  order by coalesce(pa.decided_at, pa.created_at), pa.created_at, pa.id
  limit 1;

  if v_new is null then
    -- 抜ける相手がいない: 「募集を取り消す」と同じ
    update public.recruitments set status = 'cancelled', cancelled_at = now() where id = r.id;
    for p in select user_id from public.participations
             where recruitment_id = r.id and status in ('pending', 'approved') loop
      perform private.notify(p.user_id, 'recruitment_cancelled', r.id);
    end loop;
    return;
  end if;

  update public.participations set status = 'cancelled', decided_at = now() where id = v_new_part;
  v_count := greatest(r.approved_count - 1, 0);
  update public.recruitments set
    owner_id = v_new,
    approved_count = v_count,
    status = case when status = 'full' then 'open' else status end,
    filled_at = case when status = 'full' then null else filled_at end,
    duo_playing = case when v_count = 0 then false else duo_playing end,
    owner_roles = '{}',
    owner_deck_level = null,
    owner_collab = null,
    min_deck_level = null,
    min_collab = null
  where id = r.id;

  -- 「募集を続けますか？」の確認が出ていれば新しい募集者へ
  update public.notifications set user_id = v_new
    where recruitment_id = r.id and kind = 'close_check' and user_id = v_uid;

  perform private.notify(v_new, 'became_owner', r.id);
  for p in select user_id from public.participations
           where recruitment_id = r.id and status in ('pending', 'approved') and user_id <> v_new loop
    perform private.notify(p.user_id, 'owner_changed', r.id);
  end loop;
end;
$$;
revoke execute on function public.leave_recruitment_as_owner(uuid) from public, anon;
grant execute on function public.leave_recruitment_as_owner(uuid) to authenticated;

-- E) 終了10分前の予告 ---------------------------------------------------------
alter table public.recruitments add column if not exists end_warned_at timestamptz;

-- 終了時刻が延びたら予告をやり直す (延長・2固定中の自動延長)。clamp_room_end (名前順で先に動く) のあとの値で比べる
create or replace function private.reset_end_warned()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at > old.ends_at then
    new.end_warned_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists recruitments_reset_end_warned on public.recruitments;
create trigger recruitments_reset_end_warned before update of ends_at on public.recruitments
  for each row execute function private.reset_end_warned();

create or replace function private.tick_recruitments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  -- 予定時刻の知らせ (募集者と参加確定の方)
  for r in
    update public.recruitments set start_notified_at = now()
    where start_notified_at is null and starts_at <= now()
      and status in ('open', 'full') and hidden_at is null and ends_at > now()
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'starting', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;

  -- 2固定中: 参加者がいなくなったら戻す。終了が近づいたら30分延ばす (開始から6時間まで)
  update public.recruitments set duo_playing = false
    where duo_playing and approved_count = 0;
  update public.recruitments
    set ends_at = least(ends_at + interval '30 minutes', starts_at + interval '6 hours')
    where duo_playing and status in ('open', 'full') and hidden_at is null
      and ends_at > now() and ends_at <= now() + interval '10 minutes'
      and ends_at < starts_at + interval '6 hours';

  -- 終了10分前の予告 (募集者と参加確定の方に1回だけ。終了時刻が延びたら trigger で予告をやり直す)
  for r in
    update public.recruitments set end_warned_at = now()
    where end_warned_at is null and status in ('open', 'full') and hidden_at is null
      and ends_at > now() and ends_at <= now() + interval '10 minutes'
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'ending_soon', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;

  -- 55分たってもそろわない募集は、募集者に続けるか確かめる
  for r in
    update public.recruitments set close_check_at = now()
    where status = 'open' and hidden_at is null and not duo_playing and close_check_at is null
      and coalesce(alive_at, starts_at) + interval '55 minutes' <= now() and ends_at > now()
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id) values (r.owner_id, 'close_check', r.id);
    n := n + 1;
  end loop;

  -- 確かめてから5分たっても操作がなければ取り消す (その間に満員・2固定中になったものは除く)
  for r in
    update public.recruitments set status = 'cancelled', cancelled_at = now()
    where status = 'open' and hidden_at is null and not duo_playing
      and close_check_at is not null and close_check_at + interval '5 minutes' <= now()
    returning id, owner_id
  loop
    delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'auto_closed', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- F) 終了後10分間のお礼 --------------------------------------------------------
-- 終了後は ends_at + 10分 まで、募集者と参加確定の方だけ書き込める。取り消した募集は今までどおり書き込めない
create or replace function public.send_message(p_recruitment_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_body text := btrim(p_body);
  v_id uuid;
  m record;
begin
  if not private.can_chat(p_recruitment_id, v_uid) then
    raise exception 'このチャットには書き込めません' using errcode = '42501';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id;
  if r.status = 'cancelled' or r.hidden_at is not null then
    raise exception 'この募集のチャットは利用できません' using errcode = '22023';
  end if;
  if r.ends_at <= now() and (r.ends_at + interval '10 minutes' <= now() or not private.is_member(p_recruitment_id, v_uid)) then
    raise exception '募集が終了したため送信できません' using errcode = '22023';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 300 then
    raise exception 'メッセージは1〜300文字で入力してください' using errcode = '22023';
  end if;
  if private.contains_url(v_body) then
    raise exception 'URLは送信できません' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages where user_id = v_uid and created_at > now() - interval '2 seconds') then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages where user_id = v_uid and created_at > now() - interval '30 seconds') >= 5 then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;

  insert into public.messages (recruitment_id, user_id, body) values (p_recruitment_id, v_uid, v_body)
  returning id into v_id;

  -- 新着の知らせは募集者と参加確定のメンバーだけ (未読の新着がない方に1件)
  for m in
    select r.owner_id as uid
    union
    select pa.user_id from public.participations pa
    where pa.recruitment_id = p_recruitment_id and pa.status = 'approved'
  loop
    if m.uid <> v_uid and not exists (
      select 1 from public.notifications n
      where n.user_id = m.uid and n.recruitment_id = p_recruitment_id
        and n.kind = 'new_message' and n.read_at is null
    ) then
      perform private.notify(m.uid, 'new_message', p_recruitment_id);
    end if;
  end loop;

  return v_id;
end;
$$;
