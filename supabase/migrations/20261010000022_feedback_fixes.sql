-- v14 (2026-10-10): 利用者のフィードバックへの対応。2回流しても壊れない。
--  1) チャット: 1回50文字まで (前は20文字)。
--     直近の発言をつなげて調べるとき、4桁の数字だけの発言 (部屋番号) はつなげない。
--     前は「1234」「5678」「9012」と部屋番号を送り直すと10桁以上の数字 (電話番号) と見なされ、
--     「ok」「1234」でも ID らしいもの (英字と数字の6文字) と見なされて「使用できない言葉」になっていた。
--     電話番号 (0 で始まる10桁以上) は、分けて送られても今までどおり弾く。
--  2) 部屋番号: 参加が確定したメンバーも入力・変更できる。変わったら、ほかのメンバーに通知する (room_code)。
--  3) 募集の延長: 募集者は終了前なら30分・1時間ずつ延ばせる (開始から6時間まで。表の制約と同じ)。
--  4) チャットの通知を募集ごとに止める (chat_mutes)。止めた募集の新着メッセージ通知はプッシュしない。
--  5) お気に入りの募集通知を減らす
--     - 一緒に遊んだ人を自動でお気に入りに入れない (これまでに入ったものはそのまま。ベルで外せる)
--     - 同じ方の募集は3時間に1回まで。お気に入りの募集通知は1人あたり3時間に5件まで
--  6) 参加の申請: 募集者に外された (見送られた) 募集では、その理由を伝える

-- 1) ---------------------------------------------------------------------
create or replace function private.limit_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent text;
  v_raw text;
  v_new text;
begin
  if char_length(btrim(new.body)) > 50 then
    raise exception 'メッセージは50文字以内で入力してください' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception '続けて送信することはできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 8 then
    raise exception '送信が多すぎます。1分ほど待ってからお試しください' using errcode = 'P0429';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and recruitment_id = new.recruitment_id
               and btrim(body) = btrim(new.body) and created_at > now() - interval '1 minute') then
    raise exception '同じ内容は続けて送信できません' using errcode = 'P0429';
  end if;
  if private.contains_contact(new.body) then
    raise exception '連絡先やIDは送信できません' using errcode = '22023';
  end if;
  -- 分けて送っても見つかるよう、直近3分の自分の発言 (4件まで) とつなげて調べる。
  -- 4桁の数字だけの発言は部屋番号として扱い、つなげない (区切りの「ー」に置き換える)。
  -- ただし電話番号 (0 で始まる10桁以上) は、部屋番号の形に分けて送られても見つける
  select string_agg(
           case when btrim(normalize(body, NFKC)) ~ '^[0-9]{4}$' then 'ー' else body end,
           '' order by created_at),
         string_agg(body, '' order by created_at)
    into v_recent, v_raw
  from (
    select body, created_at from public.messages
    where user_id = new.user_id and recruitment_id = new.recruitment_id and created_at > now() - interval '3 minutes'
    order by created_at desc
    limit 4
  ) x;
  v_new := case when btrim(normalize(new.body, NFKC)) ~ '^[0-9]{4}$' then 'ー' else new.body end;
  if v_recent is not null
     and (private.contains_banned(v_recent || v_new) or private.contains_contact(v_recent || v_new)
          or translate(private.normalize_for_filter(v_raw || new.body), '〇零一二三四五六七八九', '00123456789') ~ '0[0-9]{9,}') then
    raise exception '使用できない言葉が含まれています' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- 2) ---------------------------------------------------------------------
alter table public.recruitment_secrets add column if not exists updated_by uuid;

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code'
));

create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_code text := nullif(btrim(p_room_code), '');
  v_old text;
  r public.recruitments;
  m record;
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
  select room_code into v_old from public.recruitment_secrets where recruitment_id = p_recruitment_id;
  insert into public.recruitment_secrets (recruitment_id, room_code, updated_by)
  values (p_recruitment_id, v_code, v_uid)
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_by = excluded.updated_by, updated_at = now();
  -- 番号が変わったら、ほかのメンバーに知らせる (まだ読んでいない前の知らせは消して1件にする)
  if v_code is not null and v_code is distinct from v_old then
    for m in
      select r.owner_id as uid
      union
      select pa.user_id from public.participations pa
      where pa.recruitment_id = p_recruitment_id and pa.status = 'approved'
    loop
      continue when m.uid = v_uid;
      delete from public.notifications
        where user_id = m.uid and recruitment_id = p_recruitment_id and kind = 'room_code' and read_at is null;
      perform private.notify(m.uid, 'room_code', p_recruitment_id);
    end loop;
  end if;
end;
$$;
revoke execute on function public.set_room_code(uuid, text) from public, anon;
grant execute on function public.set_room_code(uuid, text) to authenticated;

-- 部屋番号と、最後に変えた方・時刻 (メンバーだけ)
create or replace function public.get_room_info(p_recruitment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_recruitment_id, auth.uid()) then
    return null;
  end if;
  return (
    select jsonb_build_object('code', s.room_code, 'updated_at', s.updated_at, 'updated_by', s.updated_by)
    from public.recruitment_secrets s where s.recruitment_id = p_recruitment_id
  );
end;
$$;
revoke execute on function public.get_room_info(uuid) from public, anon;
grant execute on function public.get_room_info(uuid) to authenticated;

-- 3) ---------------------------------------------------------------------
create or replace function public.extend_recruitment(p_recruitment_id uuid, p_minutes int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_end timestamptz;
begin
  if p_minutes not in (30, 60) then
    raise exception '延長できるのは30分か1時間です' using errcode = '22023';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ延長できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.hidden_at is not null or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  v_end := least(r.ends_at + make_interval(mins => p_minutes), r.starts_at + interval '6 hours');
  if v_end <= r.ends_at then
    raise exception '開始から6時間より先には延長できません' using errcode = '22023';
  end if;
  update public.recruitments set ends_at = v_end where id = r.id;
  return v_end;
end;
$$;
revoke execute on function public.extend_recruitment(uuid, int) from public, anon;
grant execute on function public.extend_recruitment(uuid, int) to authenticated;

-- 4) ---------------------------------------------------------------------
create table if not exists public.chat_mutes (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  recruitment_id uuid not null references public.recruitments (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, recruitment_id)
);
create index if not exists chat_mutes_recruitment_idx on public.chat_mutes (recruitment_id);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from public, anon, authenticated;
grant select on public.chat_mutes to authenticated;
drop policy if exists chat_mutes_select_own on public.chat_mutes;
create policy chat_mutes_select_own on public.chat_mutes
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.set_chat_mute(p_recruitment_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_on then
    if not private.is_member(p_recruitment_id, v_uid) then
      raise exception 'このチャットには参加していません' using errcode = '42501';
    end if;
    insert into public.chat_mutes (user_id, recruitment_id) values (v_uid, p_recruitment_id) on conflict do nothing;
  else
    delete from public.chat_mutes where user_id = v_uid and recruitment_id = p_recruitment_id;
  end if;
end;
$$;
revoke execute on function public.set_chat_mute(uuid, boolean) from public, anon;
grant execute on function public.set_chat_mute(uuid, boolean) to authenticated;

-- 止めた募集の新着メッセージ通知は、通知欄には残し、プッシュはしない (送信済みの印を先に付ける)
create or replace function private.skip_muted_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'new_message' and new.recruitment_id is not null and exists (
    select 1 from public.chat_mutes c where c.user_id = new.user_id and c.recruitment_id = new.recruitment_id
  ) then
    new.pushed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_skip_muted_push on public.notifications;
create trigger notifications_skip_muted_push before insert on public.notifications
  for each row execute function private.skip_muted_push();

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
      -- v14: お気に入り (募集の通知) には自動で入れない。入れるかはベルで本人が決める
    end if;
  end loop;
  return new;
end;
$$;

create index if not exists notifications_followed_idx on public.notifications (user_id, created_at)
  where kind = 'followed_posted';

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
    and not private.is_blocked_between(f.follower_id, new.owner_id)
    -- 同じ方の募集は3時間に1回まで
    and not exists (
      select 1 from public.notifications n
      join public.recruitments r2 on r2.id = n.recruitment_id
      where n.user_id = f.follower_id and n.kind = 'followed_posted'
        and n.created_at > now() - interval '3 hours' and r2.owner_id = new.owner_id
    )
    -- お気に入りの募集通知は、1人あたり3時間に5件まで
    and (
      select count(*) from public.notifications n
      where n.user_id = f.follower_id and n.kind = 'followed_posted' and n.created_at > now() - interval '3 hours'
    ) < 5;
  return new;
end;
$$;

-- 6) ---------------------------------------------------------------------
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
