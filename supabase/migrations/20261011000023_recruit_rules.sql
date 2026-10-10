-- v15 (2026-10-11): 運営者の指定。2回流しても壊れない。migration 22 のあとに流す。
--  1) 部屋番号が変わっても通知しない (migration 22 の通知をやめる)
--  2) 自動で入っていた「一緒に遊んだ人のお気に入り」をオフにする
--     (自動の行は、相手側の行と作成時刻がまったく同じ = 同じ処理で両方向に作られたもの)
--  3) 募集の項目を足す
--     - duo_ok: 2固定でも可 (バトルアリーナ・フリーバトル)
--     - wanted_roles: ほしいロール (任意)
--     - バトルアリーナの承認制だけ: 募集者のデキレ・コラボ数と、参加の条件 (デキレ・コラボ数の下限)
--       デキレは 120〜240 の10刻み、コラボ数は1以上の整数。参加を申し込む方も申告する (participations に残す)
--  4) 予定時刻になったら、募集者と参加が確定した方に「予定時刻になりました」(starting)
--     開始から60分たっても始まらない募集 (人がそろわない) は自動で閉じ、同じ方々に知らせる (auto_closed)
--     始まったとみなすもの: 満員 / 2固定でも可で1人以上 / カスタムで1人以上
--     毎分の定期処理 (compass-tick)。作った知らせは pg_net でサイトの /api/push/dispatch を呼んでプッシュする

-- 1) ---------------------------------------------------------------------
alter table public.recruitment_secrets add column if not exists updated_by uuid;
create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_code text := nullif(btrim(p_room_code), '');
  r public.recruitments;
begin
  if not private.is_member(p_recruitment_id, v_uid) then
    raise exception '参加が確定したメンバーだけが変更できます' using errcode = '42501';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id;
  if r.status = 'cancelled' or r.hidden_at is not null or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  if v_code is not null and v_code !~ '^[0-9]{4}$' then
    raise exception '部屋番号は4桁の数字で入力してください' using errcode = '22023';
  end if;
  insert into public.recruitment_secrets (recruitment_id, room_code, updated_by)
  values (p_recruitment_id, v_code, v_uid)
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
delete from public.notifications where kind = 'room_code';

-- 2) ---------------------------------------------------------------------
update public.follows f set active = false
where f.active
  and exists (
    select 1 from public.follows g
    where g.follower_id = f.followee_id and g.followee_id = f.follower_id and g.created_at = f.created_at
  );

-- 3) ---------------------------------------------------------------------
alter table public.recruitments add column if not exists duo_ok boolean not null default false;
alter table public.recruitments add column if not exists wanted_roles text[] not null default '{}';
alter table public.recruitments add column if not exists owner_deck_level int;
alter table public.recruitments add column if not exists owner_collab int;
alter table public.recruitments add column if not exists min_deck_level int;
alter table public.recruitments add column if not exists min_collab int;
alter table public.recruitments add column if not exists start_notified_at timestamptz;
alter table public.recruitments drop constraint if exists recruitments_wanted_roles_chk;
alter table public.recruitments add constraint recruitments_wanted_roles_chk
  check (private.all_in(wanted_roles, array['attacker', 'gunner', 'tank', 'sprinter']));
alter table public.recruitments drop constraint if exists recruitments_deck_chk;
alter table public.recruitments add constraint recruitments_deck_chk check (
  (owner_deck_level is null or (owner_deck_level between 120 and 240 and owner_deck_level % 10 = 0))
  and (min_deck_level is null or (min_deck_level between 120 and 240 and min_deck_level % 10 = 0))
  and (owner_collab is null or owner_collab between 1 and 9999)
  and (min_collab is null or min_collab between 1 and 9999)
);
alter table public.participations add column if not exists deck_level int;
alter table public.participations add column if not exists collab int;
alter table public.participations drop constraint if exists participations_deck_chk;
alter table public.participations add constraint participations_deck_chk check (
  (deck_level is null or (deck_level between 120 and 240 and deck_level % 10 = 0))
  and (collab is null or collab between 1 and 9999)
);
-- 前からある募集は、予定時刻の知らせを出さない
update public.recruitments set start_notified_at = now() where start_notified_at is null and starts_at <= now() + interval '1 minute';

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text);
drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int);
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
  p_min_collab int default null
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
    duo_ok, wanted_roles, owner_deck_level, owner_collab, min_deck_level, min_collab, start_notified_at
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
    case when p_starts_at <= now() + interval '1 minute' then now() end
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;
revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int) to authenticated;

drop function if exists public.request_join(uuid, text);
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
    if p_deck_level not between 120 and 240 or p_deck_level % 10 <> 0 or p_collab not between 1 and 9999 then
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

-- 4) ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code', 'starting', 'auto_closed'
));

create index if not exists recruitments_start_notify_idx on public.recruitments (starts_at)
  where start_notified_at is null;

insert into public.app_settings (key, value) values ('site_url', '"https://compass-match.vercel.app"')
  on conflict (key) do nothing;
insert into public.server_secrets (key, value)
  values ('dispatch_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

-- 予定時刻の知らせと、始まらなかった募集を閉じる。作った知らせの件数を返す
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

  for r in
    update public.recruitments set status = 'ended', ends_at = now()
    where status = 'open' and hidden_at is null
      and starts_at + interval '60 minutes' <= now() and ends_at > now()
      and not (approved_count >= 1 and (duo_ok or purpose = 'custom'))
    returning id, owner_id
  loop
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

-- 知らせを作ったら、サイトにプッシュを送らせる (pg_net があるときだけ)
create or replace function private.tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if private.tick_recruitments() = 0 then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  select value #>> '{}' into v_url from public.app_settings where key = 'site_url';
  select value into v_token from public.server_secrets where key = 'dispatch_token';
  if v_url is null or v_token is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb)'
    using v_url || '/api/push/dispatch', jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-token', v_token);
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('compass-tick') where exists (select 1 from cron.job where jobname = 'compass-tick');
    perform cron.schedule('compass-tick', '* * * * *', 'select private.tick()');
  end if;
end $$;
