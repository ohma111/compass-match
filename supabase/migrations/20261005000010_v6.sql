-- v6 (2026-10-05): 運営者の要望
--  1) 禁止語: チャット・募集のひとこと/メモ・表示名・自己紹介に、禁止語・メールアドレス・10桁以上の数字を入れられない
--     (語の一覧は src/lib/moderation/banned.ts と同じ。tests/banned.test.ts で一致を確認)
--  2) チャット: 20文字まで。連投は 3秒に1件 / 1分に8件まで / 同じ文は1分以内に2回送れない
--  3) 募集に「ゲームへの姿勢」(win=勝ちたい / fun=楽しみたい) を追加。create_recruitment に p_stance
--  4) 自己紹介は100文字まで (既存の長い自己紹介はそのまま残す)
--  5) いっしょに遊んだ人の記録 (play_mates) と、気になる人の募集の通知 (follows)
--  6) プッシュ通知の登録先 (push_subscriptions) と、送ったかどうか (notifications.pushed_at)、サーバー専用の値 (server_secrets)
-- 2回流しても壊れない。

-- 1) ---------------------------------------------------------------------
create or replace function private.normalize_for_filter(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(normalize(coalesce(p, ''), NFKC)), 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ', 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),
    '[^0-9a-zぁ-ゖー一-鿯々]', '', 'g');
$$;

create or replace function private.banned_terms()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'らいん交換', 'らいんこうかん', 'line交換', 'lineこうかん', 'らいん教', 'らいんおしえ', 'line教', 'lineおしえ',
    'らいんやって', 'lineやって', 'らいんid', 'lineid', 'かかお', 'kakao', 'いんすた', 'insta',
    'てぃっくとっく', 'tiktok', 'snapchat', 'telegram', 'てれぐらむ', 'whatsapp', 'kik', '電話番号',
    'でんわばんごう', '電番', 'めあど', 'めーるあど', 'gmail', 'icloud', '番号教', 'ばんごうおしえ',
    '住所', 'じゅうしょ', '本名', 'ほんみょう', '最寄', 'もより', 'どこ住', 'どこすみ',
    '何県', 'なにけん', '何歳', 'なんさい', '年齢', 'ねんれい', '何年生', 'なんねんせい',
    '小学', 'しょうがく', '中学', 'ちゅうがく', '高校', '学校', 'がっこう', 'jc',
    'jk', '会お', '会いたい', 'あいたい', '会える', 'あえる', 'おふかい', 'おふ会',
    '出会', 'であい', '付き合', 'つきあ', '恋人', 'こいびと', '彼女にな', 'かのじょにな',
    '彼氏にな', 'かれしにな', 'せふれ', 'ぱぱかつ', 'ままかつ', 'ぱぱ活', 'まま活', '援交',
    'えんこう', '援助交際', 'おふぱこ', 'えっち', 'えろい', 'えろ画像', 'せっくす', 'sex',
    'おなに', 'ぬーど', '裸', 'はだか', '下着', 'したぎ', 'ぱんつ', '自撮',
    'じどり', '顔写真', 'かおしゃしん', '写真送', 'しゃしんおく', '泊まり', 'ちんこ', 'まんこ',
    'ちんぽ', 'おっぱい', '大麻', '覚醒剤', '闇ばいと', 'やみばいと', '高収入', 'こうしゅうにゅう',
    '稼げ', 'かせげ', '振込', 'ふりこみ', '振り込', '口座', 'こうざ', '現金',
    'げんきん', '送金', 'そうきん', 'あまぎふ', 'ぎふと券', 'ぎふとけん', '代行', 'だいこう',
    '垢売', 'あかうり', 'rmt', 'ちーと', '死ね', 'しね', '殺す', 'ころす',
    '殺し', 'ころし', 'きもい', 'きもすぎ', 'うざい', 'がいじ', '池沼', 'ちしょう',
    '雑魚', 'ざこ'
  ];
$$;

create or replace function private.contains_banned(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text;
  t text;
begin
  if p is null or p = '' then
    return false;
  end if;
  if normalize(p, NFKC) ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return true;
  end if;
  n := private.normalize_for_filter(p);
  if n ~ '[0-9]{10,}' then
    return true;
  end if;
  foreach t in array private.banned_terms() loop
    if strpos(n, t) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function private.reject_banned_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'messages' then
    if private.contains_banned(new.body) then
      raise exception '使えない言葉が入っています' using errcode = '22023';
    end if;
  elsif tg_table_name = 'recruitments' then
    if (tg_op = 'INSERT' or new.title is distinct from old.title or new.note is distinct from old.note)
       and (private.contains_banned(new.title) or private.contains_banned(new.note)) then
      raise exception '使えない言葉が入っています' using errcode = '22023';
    end if;
  elsif tg_table_name = 'profiles' then
    if (tg_op = 'INSERT' and (private.contains_banned(new.display_name) or private.contains_banned(new.bio)))
       or (tg_op = 'UPDATE' and new.display_name is distinct from old.display_name and private.contains_banned(new.display_name))
       or (tg_op = 'UPDATE' and new.bio is distinct from old.bio and private.contains_banned(new.bio)) then
      raise exception '使えない言葉が入っています' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_reject_banned on public.messages;
create trigger messages_reject_banned before insert on public.messages
  for each row execute function private.reject_banned_text();
drop trigger if exists recruitments_reject_banned on public.recruitments;
create trigger recruitments_reject_banned before insert or update of title, note on public.recruitments
  for each row execute function private.reject_banned_text();
drop trigger if exists profiles_reject_banned on public.profiles;
create trigger profiles_reject_banned before insert or update of display_name, bio on public.profiles
  for each row execute function private.reject_banned_text();

-- 2) ---------------------------------------------------------------------
create or replace function private.limit_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(new.body)) > 20 then
    raise exception 'メッセージは20文字までです' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception '連続で送れません。少し待ってください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 8 then
    raise exception '送りすぎです。1分ほど待ってください' using errcode = 'P0429';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and recruitment_id = new.recruitment_id
               and btrim(body) = btrim(new.body) and created_at > now() - interval '1 minute') then
    raise exception '同じ文は続けて送れません' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_limit_chat on public.messages;
create trigger messages_limit_chat before insert on public.messages
  for each row execute function private.limit_chat();

-- 3) ---------------------------------------------------------------------
alter table public.recruitments add column if not exists stance text not null default 'fun';
alter table public.recruitments drop constraint if exists recruitments_stance_chk;
alter table public.recruitments add constraint recruitments_stance_chk check (stance in ('win', 'fun'));

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text);
drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text);

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
  p_stance text default 'fun'
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
  if p_stance is null or p_stance not in ('win', 'fun') then
    raise exception 'ゲームへの姿勢を選んでください' using errcode = '22023';
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
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src, join_mode, stance
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src), p_join_mode, p_stance
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;

revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text) to authenticated;

-- 4) ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_bio_len_v6;
alter table public.profiles add constraint profiles_bio_len_v6 check (char_length(bio) <= 100) not valid;

-- 5) ---------------------------------------------------------------------
create table if not exists public.play_mates (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  mate_id        uuid not null references public.profiles (id) on delete cascade,
  times          int not null default 1,
  last_played_at timestamptz not null default now(),
  primary key (user_id, mate_id),
  constraint play_mates_not_self check (user_id <> mate_id)
);
create index if not exists play_mates_recent_idx on public.play_mates (user_id, last_played_at desc);
alter table public.play_mates enable row level security;
revoke all on public.play_mates from public, anon, authenticated;
grant select on public.play_mates to authenticated;
drop policy if exists play_mates_select_own on public.play_mates;
create policy play_mates_select_own on public.play_mates
  for select to authenticated using (user_id = auth.uid());

-- 参加が確定したら、同じ募集の募集者・確定者どうしを「いっしょに遊んだ人」に入れる (1つの募集で1回だけ数える)
create table if not exists private.play_mates_counted (
  recruitment_id uuid not null,
  user_id uuid not null,
  mate_id uuid not null,
  primary key (recruitment_id, user_id, mate_id)
);
alter table private.play_mates_counted enable row level security;
revoke all on private.play_mates_counted from public, anon, authenticated;

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
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists participations_record_play_mates on public.participations;
create trigger participations_record_play_mates after insert or update of status on public.participations
  for each row execute function private.record_play_mates();

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;
grant select on public.follows to authenticated;
drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows
  for select to authenticated using (follower_id = auth.uid());

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
    raise exception '不正なリクエストです' using errcode = '22023';
  end if;
  if not p_on then
    delete from public.follows where follower_id = v_uid and followee_id = p_target;
    return;
  end if;
  if private.is_blocked_between(v_uid, p_target) then
    raise exception 'この人の通知は受け取れません' using errcode = '22023';
  end if;
  if (select count(*) from public.follows where follower_id = v_uid) >= 200 then
    raise exception '通知を受け取る人は200人までです' using errcode = 'P0429';
  end if;
  insert into public.follows (follower_id, followee_id) values (v_uid, p_target) on conflict do nothing;
end;
$$;
revoke execute on function public.set_follow(uuid, boolean) from public, anon;
grant execute on function public.set_follow(uuid, boolean) to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted'
));

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
    and p.banned_at is null
    and not private.is_blocked_between(f.follower_id, new.owner_id);
  return new;
end;
$$;

drop trigger if exists recruitments_notify_followers on public.recruitments;
create trigger recruitments_notify_followers after insert on public.recruitments
  for each row execute function private.notify_followers();

-- 6) ---------------------------------------------------------------------
alter table public.notifications add column if not exists pushed_at timestamptz;
-- 以前の通知はプッシュしない
update public.notifications set pushed_at = created_at where pushed_at is null and created_at < now() - interval '5 minutes';
create index if not exists notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  constraint push_endpoint_chk check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint push_keys_chk check (char_length(p256dh) <= 200 and char_length(auth) <= 100)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if (select count(*) from public.push_subscriptions where user_id = v_uid) >= 5 then
    delete from public.push_subscriptions where id in (
      select id from public.push_subscriptions where user_id = v_uid order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = v_uid, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

create or replace function public.has_push_subscription()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_subscriptions where user_id = auth.uid());
$$;
revoke execute on function public.has_push_subscription() from public, anon;
grant execute on function public.has_push_subscription() to authenticated;

-- サーバー (service_role) だけが読む値。プッシュ通知の鍵はサーバーが初回に自動で作ってここに保存する
create table if not exists public.server_secrets (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.server_secrets enable row level security;
revoke all on public.server_secrets from public, anon, authenticated;
