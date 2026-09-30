-- =====================================================================
-- ヘルパー関数と業務ロジック RPC
-- 状態を変える操作は原則 security definer の RPC に集約し、
-- 権限チェック・レート制限・整合性(枠数)をDB内で強制する。
-- レート制限値は src/lib/constants.ts の RATE_LIMITS と揃えること。
-- =====================================================================

-- ---------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------
create or replace function private.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

create or replace function private.is_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = p_uid and role = 'admin');
$$;

-- 停止・BAN・通報による一時非表示のいずれでもないプロフィールを持つか
create or replace function private.is_active_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_uid and banned_at is null and suspended_at is null and hidden_at is null
  );
$$;

create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function private.is_owner(p_recruitment_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.recruitments where id = p_recruitment_id and owner_id = p_uid);
$$;

-- 募集者 または 承認済み参加者
create or replace function private.is_member(p_recruitment_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and (
    exists (select 1 from public.recruitments where id = p_recruitment_id and owner_id = p_uid)
    or exists (
      select 1 from public.participations
      where recruitment_id = p_recruitment_id and user_id = p_uid and status = 'approved'
    )
  );
$$;

-- 表示上の状態。status 列に加え、終了時刻を過ぎていれば ended とみなす。
-- (定期ジョブが止まっていても正しく判定するため)
create or replace function private.effective_status(p_status text, p_ends_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status in ('cancelled', 'ended') then p_status
    when p_ends_at <= now() then 'ended'
    else p_status
  end;
$$;

-- チャットがまだ読める期間か (終了 + 保持時間)
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
      and r.ends_at + make_interval(hours => private.setting_int('chat_retention_hours', 6)) > now()
  );
$$;

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
  return v_uid;
end;
$$;

create or replace function private.notify(p_user uuid, p_kind text, p_recruitment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, recruitment_id) values (p_user, p_kind, p_recruitment);
$$;

create or replace function private.clean_src(p_src text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_src ~ '^[a-z0-9_-]{1,32}$' then p_src else null end;
$$;

-- updated_at 自動更新
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger contacts_touch before update on public.profile_contacts
  for each row execute function private.touch_updated_at();
create trigger participations_touch before update on public.participations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- プロフィール
-- ---------------------------------------------------------------------
create or replace function public.save_my_profile(
  p_display_name text,
  p_rank_band text,
  p_play_roles text[],
  p_characters text[],
  p_purposes text[],
  p_vc text,
  p_tags text[],
  p_bio text,
  p_contact_discord text,
  p_contact_x text,
  p_contact_ingame text,
  p_agree_terms boolean,
  p_terms_version text,
  p_src text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;

  select exists (select 1 from public.profiles where id = v_uid) into v_exists;

  if not v_exists then
    if coalesce(p_agree_terms, false) is not true then
      raise exception '利用規約とプライバシーポリシーへの同意が必要です' using errcode = '22023';
    end if;
    insert into public.profiles (
      id, display_name, rank_band, play_roles, characters, purposes, vc, tags, bio,
      signup_src, terms_agreed_at, terms_version
    ) values (
      v_uid, btrim(p_display_name), p_rank_band, coalesce(p_play_roles, '{}'), coalesce(p_characters, '{}'),
      coalesce(p_purposes, '{}'), p_vc, coalesce(p_tags, '{}'), coalesce(p_bio, ''),
      private.clean_src(p_src), now(), p_terms_version
    );
  else
    update public.profiles set
      display_name = btrim(p_display_name),
      rank_band = p_rank_band,
      play_roles = coalesce(p_play_roles, '{}'),
      characters = coalesce(p_characters, '{}'),
      purposes = coalesce(p_purposes, '{}'),
      vc = p_vc,
      tags = coalesce(p_tags, '{}'),
      bio = coalesce(p_bio, ''),
      terms_agreed_at = case when p_agree_terms then now() else terms_agreed_at end,
      terms_version = case when p_agree_terms then p_terms_version else terms_version end
    where id = v_uid;
  end if;

  insert into public.profile_contacts (user_id, contact_discord, contact_x, contact_ingame)
  values (v_uid, nullif(btrim(p_contact_discord), ''), nullif(btrim(p_contact_x), ''), nullif(btrim(p_contact_ingame), ''))
  on conflict (user_id) do update set
    contact_discord = excluded.contact_discord,
    contact_x = excluded.contact_x,
    contact_ingame = excluded.contact_ingame;
end;
$$;

-- ---------------------------------------------------------------------
-- 募集
-- ---------------------------------------------------------------------
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
  p_src text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_id uuid;
begin
  -- 開始時刻: 30分前〜7日後まで
  if p_starts_at < now() - interval '30 minutes' or p_starts_at > now() + interval '7 days' then
    raise exception '開始日時が範囲外です' using errcode = '22023';
  end if;

  -- レート制限: 1時間に3件まで / 同時に有効な募集は3件まで
  if (select count(*) from public.recruitments
      where owner_id = v_uid and created_at > now() - interval '1 hour') >= 3 then
    raise exception '募集の作成が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.recruitments
      where owner_id = v_uid and status in ('open', 'full') and ends_at > now()) >= 3 then
    raise exception '同時に出せる募集は3件までです' using errcode = 'P0429';
  end if;

  insert into public.recruitments (
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src)
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;

create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.is_owner(p_recruitment_id, v_uid) then
    raise exception '募集者のみ変更できます' using errcode = '42501';
  end if;
  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (p_recruitment_id, nullif(btrim(p_room_code), ''))
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_at = now();
end;
$$;

create or replace function public.cancel_recruitment(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.recruitments;
  p record;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ取り消せます' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) in ('ended', 'cancelled') then
    raise exception 'この募集はすでに終了しています' using errcode = '22023';
  end if;
  update public.recruitments set status = 'cancelled', cancelled_at = now() where id = r.id;
  for p in select user_id from public.participations
           where recruitment_id = r.id and status in ('pending', 'approved') loop
    perform private.notify(p.user_id, 'recruitment_cancelled', r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 参加申請 / 承認 / 取り消し
-- ---------------------------------------------------------------------
create or replace function public.request_join(p_recruitment_id uuid, p_src text default null)
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
begin
  select * into r from public.recruitments where id = p_recruitment_id;
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

  -- レート制限: 10分間に10件まで
  if (select count(*) from public.participations
      where user_id = v_uid and updated_at > now() - interval '10 minutes') >= 10 then
    raise exception '参加申請が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception 'この募集には申請できません' using errcode = '42501';
    end if;
    -- cancelled からの再申請
    update public.participations
      set status = 'pending', decided_at = null, src = coalesce(private.clean_src(p_src), src)
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src)
    values (r.id, v_uid, 'pending', private.clean_src(p_src)) returning id into v_id;
  end if;

  perform private.notify(r.owner_id, 'join_request', r.id);
  return v_id;
end;
$$;

-- 募集者による承認/拒否。承認済みの人を拒否すると「外す」扱い。
create or replace function public.decide_participation(p_participation_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  p public.participations;
  r public.recruitments;
  v_new_count int;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception '不正な操作です' using errcode = '22023';
  end if;

  select * into p from public.participations where id = p_participation_id;
  if not found then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  -- 募集行をロックして枠数の競合を防ぐ
  select * into r from public.recruitments where id = p.recruitment_id for update;
  if r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  select * into p from public.participations where id = p_participation_id for update;

  if p_decision = 'approved' then
    if p.status <> 'pending' then
      raise exception '承認待ちの申請ではありません' using errcode = '22023';
    end if;
    if private.effective_status(r.status, r.ends_at) <> 'open' then
      raise exception 'この募集は受付中ではありません' using errcode = '22023';
    end if;
    if r.approved_count >= r.capacity - 1 then
      raise exception '満員のため承認できません' using errcode = '22023';
    end if;
    if not private.is_active_user(p.user_id) or private.is_blocked_between(v_uid, p.user_id) then
      raise exception 'この利用者は承認できません' using errcode = '42501';
    end if;
    update public.participations set status = 'approved', decided_at = now() where id = p.id;
    v_new_count := r.approved_count + 1;
    update public.recruitments set
      approved_count = v_new_count,
      status = case when v_new_count >= capacity - 1 then 'full' else status end,
      filled_at = case when v_new_count >= capacity - 1 then now() else filled_at end
    where id = r.id;
    perform private.notify(p.user_id, 'approved', r.id);
  else
    if p.status = 'pending' then
      update public.participations set status = 'rejected', decided_at = now() where id = p.id;
      perform private.notify(p.user_id, 'rejected', r.id);
    elsif p.status = 'approved' then
      update public.participations set status = 'rejected', decided_at = now() where id = p.id;
      update public.recruitments set
        approved_count = greatest(approved_count - 1, 0),
        status = case when status = 'full' then 'open' else status end,
        filled_at = case when status = 'full' then null else filled_at end
      where id = r.id;
      perform private.notify(p.user_id, 'removed', r.id);
    else
      raise exception 'この申請は操作できません' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- 参加者自身による取り消し
create or replace function public.cancel_participation(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.participations;
  r public.recruitments;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  select * into p from public.participations
  where recruitment_id = p_recruitment_id and user_id = v_uid for update;
  if not found or p.status not in ('pending', 'approved') then
    raise exception '取り消せる申請がありません' using errcode = '22023';
  end if;

  update public.participations set status = 'cancelled', decided_at = now() where id = p.id;
  if p.status = 'approved' then
    update public.recruitments set
      approved_count = greatest(approved_count - 1, 0),
      status = case when status = 'full' then 'open' else status end,
      filled_at = case when status = 'full' then null else filled_at end
    where id = r.id;
    perform private.notify(r.owner_id, 'participant_cancelled', r.id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 承認済みメンバー限定の情報 (部屋番号・連絡先)
-- ---------------------------------------------------------------------
create or replace function public.get_room_code(p_recruitment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_recruitment_id, auth.uid()) then
    return null;
  end if;
  return (select room_code from public.recruitment_secrets where recruitment_id = p_recruitment_id);
end;
$$;

create or replace function public.get_member_contacts(p_recruitment_id uuid)
returns table (
  user_id uuid,
  display_name text,
  is_owner boolean,
  contact_discord text,
  contact_x text,
  contact_ingame text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not private.is_member(p_recruitment_id, v_uid) then
    return;
  end if;
  return query
    with members as (
      select r.owner_id as uid, true as owner from public.recruitments r where r.id = p_recruitment_id
      union
      select pa.user_id, false from public.participations pa
      where pa.recruitment_id = p_recruitment_id and pa.status = 'approved'
    )
    select pr.id, pr.display_name, m.owner, c.contact_discord, c.contact_x, c.contact_ingame
    from members m
    join public.profiles pr on pr.id = m.uid
    left join public.profile_contacts c on c.user_id = m.uid
    where m.uid <> v_uid
      -- 参加者どうしの連絡先は開示しない: 募集者は承認済み参加者の連絡先を、
      -- 参加者は募集者の連絡先のみを見られる (未成年保護のため開示範囲を最小化)
      and (m.owner or private.is_owner(p_recruitment_id, v_uid))
      and pr.banned_at is null
      and not private.is_blocked_between(v_uid, m.uid)
    order by m.owner desc, pr.display_name;
end;
$$;

-- ---------------------------------------------------------------------
-- チャット
-- ---------------------------------------------------------------------
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
  if not private.is_member(p_recruitment_id, v_uid) then
    raise exception 'このチャットには参加していません' using errcode = '42501';
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

  -- 連投制限: 2秒に1件 / 30秒に5件
  if exists (select 1 from public.messages where user_id = v_uid and created_at > now() - interval '2 seconds') then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages where user_id = v_uid and created_at > now() - interval '30 seconds') >= 5 then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;

  insert into public.messages (recruitment_id, user_id, body) values (p_recruitment_id, v_uid, v_body)
  returning id into v_id;

  -- 新着通知: 未読の新着通知がないメンバーにだけ1件作る (通知の洪水を防ぐ)
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

-- ---------------------------------------------------------------------
-- ブロック
-- ---------------------------------------------------------------------
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p record;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if p_target = v_uid then
    raise exception '自分はブロックできません' using errcode = '22023';
  end if;
  if (select count(*) from public.blocks where blocker_id = v_uid) >= 500 then
    raise exception 'ブロック数の上限に達しました' using errcode = 'P0429';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_target) on conflict do nothing;

  -- 自分の(進行中の)募集から相手を外す
  for p in
    select pa.id, pa.status, pa.recruitment_id from public.participations pa
    join public.recruitments r on r.id = pa.recruitment_id
    where r.owner_id = v_uid and pa.user_id = p_target and pa.status in ('pending', 'approved')
      and r.ends_at > now()
  loop
    update public.participations set status = 'rejected', decided_at = now() where id = p.id;
    if p.status = 'approved' then
      update public.recruitments set
        approved_count = greatest(approved_count - 1, 0),
        status = case when status = 'full' then 'open' else status end,
        filled_at = case when status = 'full' then null else filled_at end
      where id = p.recruitment_id;
    end if;
  end loop;

  -- 相手の(進行中の)募集への自分の申請は取り消す
  for p in
    select pa.id, pa.status, pa.recruitment_id from public.participations pa
    join public.recruitments r on r.id = pa.recruitment_id
    where r.owner_id = p_target and pa.user_id = v_uid and pa.status in ('pending', 'approved')
      and r.ends_at > now()
  loop
    update public.participations set status = 'cancelled', decided_at = now() where id = p.id;
    if p.status = 'approved' then
      update public.recruitments set
        approved_count = greatest(approved_count - 1, 0),
        status = case when status = 'full' then 'open' else status end,
        filled_at = case when status = 'full' then null else filled_at end
      where id = p.recruitment_id;
    end if;
  end loop;
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_target;
$$;

-- ---------------------------------------------------------------------
-- 通報 (異なる通報者が閾値以上で自動一時非表示)
-- ロジックは src/lib/moderation.ts の shouldAutoHide と同じ。
-- ---------------------------------------------------------------------
create or replace function private.target_owner(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user' then (select id from public.profiles where id = p_id)
    when 'recruitment' then (select owner_id from public.recruitments where id = p_id)
    when 'message' then (select user_id from public.messages where id = p_id)
  end;
$$;

create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason text)
returns boolean  -- true: この通報で自動非表示になった
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_count int;
  v_threshold int := private.setting_int('report_auto_hide_threshold', 3);
  v_hidden boolean := false;
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
  -- チャットメッセージの通報はそのチャットのメンバーのみ
  if p_target_type = 'message' and not private.is_member(
      (select recruitment_id from public.messages where id = p_target_id), v_uid) then
    raise exception '通報対象が見つかりません' using errcode = 'P0002';
  end if;

  -- レート制限: 24時間に10件まで
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception '通報が多すぎます。時間をおいて再度お試しください' using errcode = 'P0429';
  end if;

  -- 同じ通報者の重複はユニーク制約で1件に抑える (理由は最新で上書き)
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_uid, p_target_type, p_target_id, btrim(p_reason))
  on conflict (reporter_id, target_type, target_id)
  do update set reason = excluded.reason;

  -- 未処理の通報について、異なる通報者数を数える
  select count(distinct reporter_id) into v_count
  from public.reports
  where target_type = p_target_type and target_id = p_target_id
    and resolved_at is null and reporter_id <> v_owner;

  if v_count >= v_threshold then
    if p_target_type = 'user' then
      update public.profiles set hidden_at = now() where id = p_target_id and hidden_at is null;
    elsif p_target_type = 'recruitment' then
      update public.recruitments set hidden_at = now() where id = p_target_id and hidden_at is null;
    else
      update public.messages set hidden_at = now() where id = p_target_id and hidden_at is null;
    end if;
    v_hidden := found;
  end if;
  return v_hidden;
end;
$$;

-- ---------------------------------------------------------------------
-- フィードバック (未ログインでも送信可)
-- ---------------------------------------------------------------------
create or replace function public.submit_feedback(p_body text, p_page text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(btrim(p_body)) > 1000 then
    raise exception 'フィードバックは1〜1000文字で入力してください' using errcode = '22023';
  end if;
  if v_uid is not null then
    if (select count(*) from public.feedback where user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
      raise exception '送信が多すぎます。時間をおいて再度お試しください' using errcode = 'P0429';
    end if;
  else
    -- 未ログイン分は全体で1時間に30件まで (荒らし対策の粗い上限)
    if (select count(*) from public.feedback where user_id is null and created_at > now() - interval '1 hour') >= 30 then
      raise exception '送信が混み合っています。時間をおいて再度お試しください' using errcode = 'P0429';
    end if;
  end if;
  insert into public.feedback (user_id, body, page)
  values (case when exists (select 1 from public.profiles where id = v_uid) then v_uid end, btrim(p_body), left(p_page, 200));
end;
$$;

-- ---------------------------------------------------------------------
-- 今から遊べる (機能フラグOFFでも関数は用意)
-- ---------------------------------------------------------------------
create or replace function public.set_available_now(p_on boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_exp timestamptz;
begin
  if p_on then
    v_exp := now() + interval '3 hours';
    insert into public.presence_now (user_id, expires_at) values (v_uid, v_exp)
    on conflict (user_id) do update set expires_at = excluded.expires_at, created_at = now();
    return v_exp;
  end if;
  delete from public.presence_now where user_id = v_uid;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 管理者
-- ---------------------------------------------------------------------
create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception '管理者のみ操作できます' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_admin(auth.uid()); $$;

-- action: suspend / ban / restore (停止・BAN・自動非表示をすべて解除し、未処理通報を処理済みに)
create or replace function public.admin_set_user_state(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then
    raise exception '自分自身は操作できません' using errcode = '22023';
  end if;
  if p_action = 'suspend' then
    update public.profiles set suspended_at = now() where id = p_user;
  elsif p_action = 'ban' then
    update public.profiles set banned_at = now() where id = p_user;
    delete from public.presence_now where user_id = p_user;
    update public.recruitments set status = 'cancelled', cancelled_at = now()
      where owner_id = p_user and status in ('open', 'full') and ends_at > now();
  elsif p_action = 'restore' then
    update public.profiles set suspended_at = null, banned_at = null, hidden_at = null where id = p_user;
    update public.reports set resolved_at = now()
      where target_type = 'user' and target_id = p_user and resolved_at is null;
  else
    raise exception '不正な操作です' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_delete_recruitment(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.recruitments where id = p_recruitment_id;
  update public.reports set resolved_at = now()
    where target_type = 'recruitment' and target_id = p_recruitment_id and resolved_at is null;
end;
$$;

-- 通報対象の非表示解除 (誤通報だった場合)。未処理通報を処理済みにする。
create or replace function public.admin_resolve_target(p_target_type text, p_target_id uuid, p_unhide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_unhide then
    if p_target_type = 'user' then
      update public.profiles set hidden_at = null where id = p_target_id;
    elsif p_target_type = 'recruitment' then
      update public.recruitments set hidden_at = null where id = p_target_id;
    elsif p_target_type = 'message' then
      update public.messages set hidden_at = null where id = p_target_id;
    end if;
  elsif p_target_type = 'message' then
    delete from public.messages where id = p_target_id;
  end if;
  update public.reports set resolved_at = now()
    where target_type = p_target_type and target_id = p_target_id and resolved_at is null;
end;
$$;

-- 通報を対象ごとに集計
create or replace function public.admin_report_summary()
returns table (
  target_type text,
  target_id uuid,
  target_owner uuid,
  target_label text,
  reporter_count bigint,
  reasons text[],
  latest_at timestamptz,
  is_hidden boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select
      rp.target_type,
      rp.target_id,
      private.target_owner(rp.target_type, rp.target_id),
      case rp.target_type
        when 'user' then (select display_name from public.profiles where id = rp.target_id)
        when 'recruitment' then (select title from public.recruitments where id = rp.target_id)
        when 'message' then (select left(body, 80) from public.messages where id = rp.target_id)
      end,
      count(distinct rp.reporter_id),
      array_agg(rp.reason order by rp.created_at desc),
      max(rp.created_at),
      case rp.target_type
        when 'user' then (select hidden_at is not null from public.profiles where id = rp.target_id)
        when 'recruitment' then (select hidden_at is not null from public.recruitments where id = rp.target_id)
        when 'message' then (select hidden_at is not null from public.messages where id = rp.target_id)
      end
    from public.reports rp
    where rp.resolved_at is null
    group by rp.target_type, rp.target_id
    order by count(distinct rp.reporter_id) desc, max(rp.created_at) desc
    limit 200;
end;
$$;

-- 通報者ごとの集計 (通報の悪用監視。MVPでは記録・表示のみで自動処理はしない)
create or replace function public.admin_reporter_stats()
returns table (reporter_id uuid, display_name text, total bigint, last_30d bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select rp.reporter_id, pr.display_name, count(*),
           count(*) filter (where rp.created_at > now() - interval '30 days')
    from public.reports rp
    left join public.profiles pr on pr.id = rp.reporter_id
    group by rp.reporter_id, pr.display_name
    order by count(*) desc
    limit 50;
end;
$$;

-- 検証指標 (要件書 9章)
create or replace function public.admin_metrics(p_since timestamptz default now() - interval '30 days')
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
    'users_total', (select count(*) from public.profiles),
    'users_since', (select count(*) from public.profiles where created_at >= p_since),
    'recruitments_since', (select count(*) from public.recruitments where created_at >= p_since),
    'recruitments_filled', (select count(*) from public.recruitments where created_at >= p_since and filled_at is not null),
    'recruitments_ended_unfilled', (select count(*) from public.recruitments
        where created_at >= p_since and filled_at is null and status <> 'cancelled' and ends_at <= now()),
    'avg_minutes_to_fill', (select round(avg(extract(epoch from (filled_at - created_at)) / 60)::numeric, 1)
        from public.recruitments where created_at >= p_since and filled_at is not null),
    'approved_by_src', coalesce((select jsonb_object_agg(s, c) from (
        select coalesce(src, '(なし)') as s, count(*) as c from public.participations
        where created_at >= p_since and status = 'approved' group by 1) t), '{}'::jsonb),
    'recruitments_with_approved_src', coalesce((select jsonb_object_agg(s, c) from (
        select coalesce(pa.src, '(なし)') as s, count(distinct pa.recruitment_id) as c
        from public.participations pa
        where pa.created_at >= p_since and pa.status = 'approved' group by 1) t), '{}'::jsonb),
    'recruitments_by_src', coalesce((select jsonb_object_agg(s, c) from (
        select coalesce(src, '(なし)') as s, count(*) as c from public.recruitments
        where created_at >= p_since group by 1) t), '{}'::jsonb),
    'signups_by_src', coalesce((select jsonb_object_agg(s, c) from (
        select coalesce(signup_src, '(なし)') as s, count(*) as c from public.profiles
        where created_at >= p_since group by 1) t), '{}'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 定期メンテナンス (pg_cron から5分ごとに実行)
--  - 終了時刻を過ぎた募集を ended に
--  - 終了 + 保持時間(初期6時間)を過ぎたチャットを削除
--  - 期限切れの「今から遊べる」を削除
--  - 90日より古い既読通知を削除
-- ---------------------------------------------------------------------
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
  delete from public.notifications where read_at is not null and created_at < now() - interval '90 days';
end;
$$;

-- ---------------------------------------------------------------------
-- 関数の実行権限
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.contains_url(text) to anon, authenticated, service_role;
grant execute on function private.all_in(text[], text[]) to anon, authenticated, service_role;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_active_user(uuid) to anon, authenticated;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function private.is_owner(uuid, uuid) to authenticated;
grant execute on function private.is_member(uuid, uuid) to authenticated;
grant execute on function private.chat_available(uuid) to authenticated;
grant execute on function private.effective_status(text, timestamptz) to anon, authenticated;
grant execute on function private.run_maintenance() to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.submit_feedback(text, text) to anon;
-- 管理者用関数は内部で private.require_admin() によって拒否される
