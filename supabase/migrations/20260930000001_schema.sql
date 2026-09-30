-- =====================================================================
-- #コンパス 遊び相手探し MVP : スキーマ定義
-- 時刻はすべて timestamptz (UTC保存)。表示はアプリ側でJSTに変換する。
-- =====================================================================

-- 内部用ヘルパー関数を置くスキーマ。PostgREST(API)には公開しない。
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- URL検出 (TS側 src/lib/validation/url.ts と同じルール)
-- 全角文字は NFKC 正規化してから判定する。
-- ---------------------------------------------------------------------
create or replace function private.contains_url(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select t is not null and (
    lower(normalize(t, NFKC)) ~ '(https?|ftp)://|data:image|[a-z0-9-]+\s*[.。]\s*(com|net|org|jp|io|gg|me|ly|co|app|dev|xyz|info|tv|be|to|link|page|site|ws|cc|in|us|uk)(?![a-z0-9])'
  );
$$;

-- 配列要素がすべて許可値に含まれるか
create or replace function private.all_in(arr text[], allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$ select arr <@ allowed; $$;

-- ---------------------------------------------------------------------
-- 設定値 (通報の自動非表示閾値、チャット保持時間など)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- profiles : 公開プロフィール。連絡先は別テーブル profile_contacts。
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text not null,
  rank_band       text not null,
  play_roles      text[] not null default '{}',
  characters      text[] not null default '{}',
  purposes        text[] not null default '{}',
  vc              text not null default 'listen',
  tags            text[] not null default '{}',
  bio             text not null default '',
  signup_src      text,
  terms_agreed_at timestamptz not null,
  terms_version   text not null,
  hidden_at       timestamptz,   -- 通報による自動一時非表示
  suspended_at    timestamptz,   -- 管理者による停止
  banned_at       timestamptz,   -- 管理者による恒久BAN
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint profiles_display_name_chk check (
    char_length(btrim(display_name)) between 1 and 20 and not private.contains_url(display_name)
  ),
  constraint profiles_rank_band_chk check (
    rank_band in ('fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p')
  ),
  constraint profiles_play_roles_chk check (
    private.all_in(play_roles, array['attacker', 'gunner', 'tank', 'sprinter'])
  ),
  constraint profiles_characters_chk check (
    cardinality(characters) <= 3
    and char_length(array_to_string(characters, '')) <= 60
    and not private.contains_url(array_to_string(characters, ' '))
  ),
  constraint profiles_purposes_chk check (
    private.all_in(purposes, array['tournament', 'rank', 'enjoy', 'custom'])
  ),
  constraint profiles_vc_chk check (vc in ('yes', 'listen', 'no')),
  constraint profiles_tags_chk check (
    private.all_in(tags, array['beginner_welcome', 'relaxed', 'serious', 'considerate', 'quiet_ok', 'practice'])
  ),
  constraint profiles_bio_chk check (char_length(bio) <= 200 and not private.contains_url(bio)),
  constraint profiles_src_chk check (signup_src is null or signup_src ~ '^[a-z0-9_-]{1,32}$')
);

-- 連絡先 (本人のみ直接参照可。承認済みメンバーには RPC 経由でのみ開示)
create table public.profile_contacts (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  contact_discord text,
  contact_x       text,
  contact_ingame  text,
  updated_at      timestamptz not null default now(),
  constraint contacts_discord_chk check (contact_discord is null or contact_discord ~ '^[a-z0-9_.]{2,32}$'),
  constraint contacts_x_chk check (contact_x is null or contact_x ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint contacts_ingame_chk check (
    contact_ingame is null or (char_length(contact_ingame) between 1 and 20 and not private.contains_url(contact_ingame))
  )
);

-- 管理者判定
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------
-- recruitments : 募集。部屋番号は別テーブル recruitment_secrets。
-- capacity は「募集者を含む総人数」。承認できる人数は capacity - 1。
-- ---------------------------------------------------------------------
create table public.recruitments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  purpose        text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  capacity       smallint not null,
  min_rank       text,
  vc             text not null default 'any',
  tags           text[] not null default '{}',
  note           text not null default '',
  status         text not null default 'open',
  approved_count smallint not null default 0,
  src            text,
  filled_at      timestamptz,
  cancelled_at   timestamptz,
  hidden_at      timestamptz,
  created_at     timestamptz not null default now(),

  constraint recruitments_title_chk check (
    char_length(btrim(title)) between 1 and 40 and not private.contains_url(title)
  ),
  constraint recruitments_purpose_chk check (purpose in ('tournament', 'rank', 'enjoy', 'custom')),
  constraint recruitments_time_chk check (ends_at > starts_at and ends_at <= starts_at + interval '6 hours'),
  constraint recruitments_capacity_chk check (capacity between 2 and 6),
  constraint recruitments_min_rank_chk check (
    min_rank is null or min_rank in ('fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p')
  ),
  constraint recruitments_vc_chk check (vc in ('on', 'any', 'off')),
  constraint recruitments_tags_chk check (
    private.all_in(tags, array['beginner_welcome', 'relaxed', 'serious', 'considerate', 'quiet_ok', 'practice'])
  ),
  constraint recruitments_note_chk check (char_length(note) <= 200 and not private.contains_url(note)),
  constraint recruitments_status_chk check (status in ('open', 'full', 'ended', 'cancelled')),
  constraint recruitments_count_chk check (approved_count >= 0 and approved_count <= capacity - 1),
  constraint recruitments_src_chk check (src is null or src ~ '^[a-z0-9_-]{1,32}$')
);

create index recruitments_active_starts_idx on public.recruitments (starts_at) where status in ('open', 'full');
create index recruitments_owner_idx on public.recruitments (owner_id, created_at desc);
create index recruitments_ends_idx on public.recruitments (ends_at);

create table public.recruitment_secrets (
  recruitment_id uuid primary key references public.recruitments (id) on delete cascade,
  room_code      text,
  updated_at     timestamptz not null default now(),
  constraint secrets_room_code_chk check (room_code is null or room_code ~ '^[0-9A-Za-z-]{1,16}$')
);

-- ---------------------------------------------------------------------
-- participations
-- ---------------------------------------------------------------------
create table public.participations (
  id             uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'pending',
  src            text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint participations_unique unique (recruitment_id, user_id),
  constraint participations_status_chk check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint participations_src_chk check (src is null or src ~ '^[a-z0-9_-]{1,32}$')
);

create index participations_user_idx on public.participations (user_id, created_at desc);
create index participations_recruitment_status_idx on public.participations (recruitment_id, status);

-- ---------------------------------------------------------------------
-- messages : 募集ごとのチャット (1募集1スレッド)
-- ---------------------------------------------------------------------
create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  body           text not null,
  hidden_at      timestamptz,
  created_at     timestamptz not null default now(),
  constraint messages_body_chk check (
    char_length(btrim(body)) between 1 and 300 and not private.contains_url(body)
  )
);

create index messages_recruitment_idx on public.messages (recruitment_id, created_at);
create index messages_user_recent_idx on public.messages (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- blocks / reports / feedback / notifications / presence_now
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  reason      text not null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint reports_unique unique (reporter_id, target_type, target_id),
  constraint reports_target_type_chk check (target_type in ('user', 'recruitment', 'message')),
  constraint reports_reason_chk check (char_length(btrim(reason)) between 1 and 500)
);

create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  body       text not null,
  page       text,
  created_at timestamptz not null default now(),
  constraint feedback_body_chk check (char_length(btrim(body)) between 1 and 1000),
  constraint feedback_page_chk check (page is null or char_length(page) <= 200)
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_idx on public.feedback (user_id, created_at desc);

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null,
  recruitment_id uuid references public.recruitments (id) on delete cascade,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  constraint notifications_kind_chk check (kind in (
    'join_request', 'approved', 'rejected', 'removed',
    'participant_cancelled', 'recruitment_cancelled', 'new_message'
  ))
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- 「今から遊べる」(機能フラグOFFでもテーブルは作成)
create table public.presence_now (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index presence_now_expires_idx on public.presence_now (expires_at);

-- 将来の課金拡張用: profiles に plan 列は持たせず、別テーブルで拡張する想定。
-- (例: create table public.subscriptions (user_id, plan, ...) を後から追加)
