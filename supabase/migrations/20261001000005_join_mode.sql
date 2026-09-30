-- v2: 参加方式 (instant=早い者勝ち / approval=承認制)。既存の募集は承認制のまま、新規の初期値は早い者勝ち。
alter table public.recruitments
  add column if not exists join_mode text not null default 'approval'
  constraint recruitments_join_mode_chk check (join_mode in ('instant', 'approval'));
alter table public.recruitments alter column join_mode set default 'instant';

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message'
));

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text);

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
  p_join_mode text default 'instant'
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
  if p_starts_at < now() - interval '30 minutes' or p_starts_at > now() + interval '7 days' then
    raise exception '開始日時が範囲外です' using errcode = '22023';
  end if;
  if p_purpose is distinct from 'custom' and p_capacity > 3 then
    raise exception 'カスタム以外の募集は3人までです' using errcode = '22023';
  end if;
  if p_join_mode is null or p_join_mode not in ('instant', 'approval') then
    raise exception '参加方式が不正です' using errcode = '22023';
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
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src, join_mode
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src), p_join_mode
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;

revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text) to authenticated;

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
  v_status text;
  v_count int;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.hidden_at is not null or not private.is_active_user(r.owner_id) then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  if r.owner_id = v_uid then
    raise exception '自分の募集には申請できません' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_uid, r.owner_id) then
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

  v_status := case when r.join_mode = 'instant' then 'approved' else 'pending' end;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception 'この募集には申請できません' using errcode = '42501';
    end if;
    update public.participations
      set status = v_status,
          decided_at = case when v_status = 'approved' then now() end,
          src = coalesce(private.clean_src(p_src), src)
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src, decided_at)
    values (r.id, v_uid, v_status, private.clean_src(p_src), case when v_status = 'approved' then now() end)
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
