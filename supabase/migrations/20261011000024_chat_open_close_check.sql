-- v16 (2026-10-11 夜): 運営者の指定。2回流しても壊れない。migration 23 のあとに流す。
--  1) チャット: 参加が確定していなくても、プロフィールのある方なら受付中の募集のチャットを読み書きできる
--     (部屋番号・連絡先は今までどおり参加確定のメンバーだけ。新着の知らせもメンバーだけ)
--  2) 始まらない募集: 開始 (または「続ける」を押した時刻) から55分で募集者に確認 (close_check)。
--     5分以内に「続ける」がなければ取り消し、募集者と参加者に知らせる (auto_closed)。満員は対象外。
--     migration 23 の「60分で自動終了」はやめる
--  3) 2固定中 (duo_playing): バトルアリーナ・フリーバトルの3人募集で1人以上いるとき、募集者が切り替える。
--     確認・取り消しの対象外。終了時刻が近づくと30分ずつ自動で延ばす (開始から6時間まで)。参加者が0人になったら戻す
--  4) コラボ数は0以上
--  5) 募集者が使うロール (owner_roles)

-- 1) ---------------------------------------------------------------------
create or replace function private.can_chat(p_recruitment_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and (
    private.is_member(p_recruitment_id, p_uid)
    or exists (
      select 1 from public.recruitments r
      join public.profiles p on p.id = p_uid
      where r.id = p_recruitment_id
        and r.status in ('open', 'full') and r.ends_at > now() and r.hidden_at is null
        and p.banned_at is null and p.hidden_at is null
        and not private.is_blocked_between(p_uid, r.owner_id)
    )
  );
$$;
grant execute on function private.can_chat(uuid, uuid) to authenticated;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    (select private.is_admin((select auth.uid())))
    or (
      private.can_chat(recruitment_id, (select auth.uid()))
      and private.chat_available(recruitment_id)
      and hidden_at is null
      and not exists (
        select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = messages.user_id
      )
    )
  );

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
  if r.ends_at <= now() then
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

-- 2) 3) 5) ---------------------------------------------------------------
alter table public.recruitments add column if not exists close_check_at timestamptz;
alter table public.recruitments add column if not exists alive_at timestamptz;
alter table public.recruitments add column if not exists duo_playing boolean not null default false;
alter table public.recruitments add column if not exists owner_roles text[] not null default '{}';
alter table public.recruitments drop constraint if exists recruitments_owner_roles_chk;
alter table public.recruitments add constraint recruitments_owner_roles_chk
  check (private.all_in(owner_roles, array['attacker', 'gunner', 'tank', 'sprinter']));

-- 4) ---------------------------------------------------------------------
alter table public.recruitments drop constraint if exists recruitments_deck_chk;
alter table public.recruitments add constraint recruitments_deck_chk check (
  (owner_deck_level is null or (owner_deck_level between 120 and 240 and owner_deck_level % 10 = 0))
  and (min_deck_level is null or (min_deck_level between 120 and 240 and min_deck_level % 10 = 0))
  and (owner_collab is null or owner_collab between 0 and 9999)
  and (min_collab is null or min_collab between 0 and 9999)
);
alter table public.participations drop constraint if exists participations_deck_chk;
alter table public.participations add constraint participations_deck_chk check (
  (deck_level is null or (deck_level between 120 and 240 and deck_level % 10 = 0))
  and (collab is null or collab between 0 and 9999)
);

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code', 'starting', 'auto_closed', 'close_check'
));

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int);
drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]);
create or replace function public.create_recruitment(
  p_title text,
  p_purpose text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity int,
  p_min_rank text,
  p_vc text,
  p_tags text[],
  p_note text,
  p_room_code text,
  p_src text default null,
  p_join_mode text default 'instant',
  p_stance text default 'fun',
  p_duo_ok boolean default false,
  p_wanted_roles text[] default '{}',
  p_owner_deck_level int default null,
  p_owner_collab int default null,
  p_min_deck_level int default null,
  p_min_collab int default null,
  p_owner_roles text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_id uuid;
  v_deck boolean := p_purpose = 'rank' and p_join_mode = 'approval';
begin
  if p_starts_at < now() - interval '30 minutes' or p_starts_at > now() + interval '7 days' then
    raise exception '開始日時が範囲外です' using errcode = '22023';
  end if;
  if p_purpose is distinct from 'custom' and p_capacity > 3 then
    raise exception 'カスタム以外の募集は3人までです' using errcode = '22023';
  end if;
  if p_join_mode is null or p_join_mode not in ('instant', 'approval') then
    raise exception '参加方式が不正です' using errcode = '22023';
  end if;
  if p_stance is null or p_stance not in ('win', 'fun') then
    raise exception 'ゲームへの姿勢を選んでください' using errcode = '22023';
  end if;
  -- デキレ・コラボ数はバトルアリーナの承認制だけ。そのときは募集者の値が必須
  if v_deck and (p_owner_deck_level is null or p_owner_collab is null) then
    raise exception 'あなたのデキレとコラボ数を入力してください' using errcode = '22023';
  end if;

  if (select count(*) from public.recruitments
      where owner_id = v_uid and created_at > now() - interval '1 hour') >= 3 then
    raise exception '募集の作成が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.recruitments
      where owner_id = v_uid and status in ('open', 'full') and ends_at > now()) >= 3 then
    raise exception '同時に出せる募集は3件までです' using errcode = 'P0429';
  end if;

  insert into public.recruitments (
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src, join_mode, stance,
    duo_ok, wanted_roles, owner_deck_level, owner_collab, min_deck_level, min_collab, start_notified_at, owner_roles
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src), p_join_mode, p_stance,
    coalesce(p_duo_ok, false) and p_purpose in ('rank', 'enjoy') and p_capacity = 3,
    coalesce(p_wanted_roles, '{}'),
    case when v_deck then p_owner_deck_level end,
    case when v_deck then p_owner_collab end,
    case when v_deck then p_min_deck_level end,
    case when v_deck then p_min_collab end,
    -- 「今すぐ」(開始が作成から1分以内) は予定時刻の知らせを出さない
    case when p_starts_at <= now() + interval '1 minute' then now() end,
    coalesce(p_owner_roles, '{}')
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;
revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]) to authenticated;

drop function if exists public.request_join(uuid, text, int, int);
create or replace function public.request_join(
  p_recruitment_id uuid,
  p_src text default null,
  p_deck_level int default null,
  p_collab int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_existing public.participations;
  v_id uuid;
  v_status text;
  v_count int;
  v_deck boolean;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.hidden_at is not null or not private.is_active_user(r.owner_id) then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  if r.owner_id = v_uid then
    raise exception '自分の募集には申請できません' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_uid, r.owner_id) then
    -- ブロック関係の有無は相手に伝わらないよう、一般的な文言にする
    raise exception 'この募集には申請できません' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) <> 'open' then
    raise exception 'この募集は現在受け付けていません' using errcode = '22023';
  end if;
  if r.approved_count >= r.capacity - 1 then
    raise exception '満員です' using errcode = '22023';
  end if;

  if (select count(*) from public.participations
      where user_id = v_uid and updated_at > now() - interval '10 minutes') >= 10 then
    raise exception '参加申請が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;

  -- デキレ・コラボ数を聞く募集 (バトルアリーナの承認制) は申告が必要。条件があれば下回る方は申し込めない
  v_deck := r.owner_deck_level is not null;
  if v_deck then
    if p_deck_level is null or p_collab is null then
      raise exception 'デキレとコラボ数を入力してください' using errcode = '22023';
    end if;
    if p_deck_level not between 120 and 240 or p_deck_level % 10 <> 0 or p_collab not between 0 and 9999 then
      raise exception 'デキレとコラボ数を選び直してください' using errcode = '22023';
    end if;
    if (r.min_deck_level is not null and p_deck_level < r.min_deck_level)
       or (r.min_collab is not null and p_collab < r.min_collab) then
      raise exception 'デキレ・コラボ数の条件を満たしていないため、申し込めません' using errcode = '22023';
    end if;
  end if;

  v_status := case when r.join_mode = 'instant' then 'approved' else 'pending' end;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception '募集者に見送られた (外された) 募集には、もう一度参加できません' using errcode = '42501';
    end if;
    update public.participations
      set status = v_status,
          decided_at = case when v_status = 'approved' then now() end,
          src = coalesce(private.clean_src(p_src), src),
          deck_level = case when v_deck then p_deck_level end,
          collab = case when v_deck then p_collab end
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src, decided_at, deck_level, collab)
    values (r.id, v_uid, v_status, private.clean_src(p_src), case when v_status = 'approved' then now() end,
            case when v_deck then p_deck_level end, case when v_deck then p_collab end)
    returning id into v_id;
  end if;

  if v_status = 'approved' then
    v_count := r.approved_count + 1;
    update public.recruitments set
      approved_count = v_count,
      status = case when v_count >= capacity - 1 then 'full' else status end,
      filled_at = case when v_count >= capacity - 1 then now() else filled_at end
    where id = r.id;
    perform private.notify(r.owner_id, 'joined', r.id);
  else
    perform private.notify(r.owner_id, 'join_request', r.id);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.request_join(uuid, text, int, int) from public, anon;
grant execute on function public.request_join(uuid, text, int, int) to authenticated;

-- 募集者の「続ける」: 確認を消し、ここから55分後にまた確認する
create or replace function public.keep_recruitment(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  update public.recruitments set close_check_at = null, alive_at = now() where id = r.id;
  delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
end;
$$;
revoke execute on function public.keep_recruitment(uuid) from public, anon;
grant execute on function public.keep_recruitment(uuid) to authenticated;

-- 2固定中の切り替え (バトルアリーナ・フリーバトルの3人募集で、参加者が1人以上)
create or replace function public.set_duo_playing(p_recruitment_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  if p_on and (r.purpose not in ('rank', 'enjoy') or r.capacity <> 3 or r.approved_count < 1) then
    raise exception '2固定中にできるのは、参加者がいるバトルアリーナ・フリーバトルの3人募集だけです' using errcode = '22023';
  end if;
  update public.recruitments
    set duo_playing = coalesce(p_on, false),
        duo_ok = duo_ok or coalesce(p_on, false),
        close_check_at = null,
        alive_at = now()
    where id = r.id;
  delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
end;
$$;
revoke execute on function public.set_duo_playing(uuid, boolean) from public, anon;
grant execute on function public.set_duo_playing(uuid, boolean) to authenticated;

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
