-- =====================================================================
-- v3: ユーザーID + パスワード登録 / 引き継ぎコード / ランク帯は初回の募集・参加時に選ぶ / 登録・引き継ぎのレート制限 /
--     作成24時間未満のアカウントの通報を自動非表示の人数に数えない
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。シードなし。
-- 既存の RLS・連絡先の開示範囲・ブロック・レート制限は変更しない。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) accounts: ユーザーID (表示名とは別。小文字で一意) と引き継ぎコードのハッシュ
--    書き込みはサーバー(service_role)が下の関数経由でのみ行う。
--    本人は自分の行の user_id / login_id / 発行日時だけ読める (ハッシュは読めない)。
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  login_id           text not null,
  recovery_hash      text,
  recovery_issued_at timestamptz,
  created_at         timestamptz not null default now(),
  constraint accounts_login_id_chk check (login_id ~ '^[a-z0-9_]{3,20}$'),
  constraint accounts_recovery_hash_chk check (recovery_hash is null or recovery_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists accounts_login_id_key on public.accounts (login_id);

alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
grant select (user_id, login_id, recovery_issued_at, created_at) on public.accounts to authenticated;
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) 登録・引き継ぎの試行記録 (IP / ユーザーID はサーバー側で HMAC したものだけを保存)
--    private スキーマなので API からは見えない。2日より古い記録は自動で消える。
-- ---------------------------------------------------------------------
create table if not exists private.auth_attempts (
  kind       text not null,
  key_hash   text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_key_idx on private.auth_attempts (kind, key_hash, created_at desc);
create index if not exists auth_attempts_created_idx on private.auth_attempts (created_at);
alter table private.auth_attempts enable row level security;
revoke all on private.auth_attempts from public, anon, authenticated;

-- 上限内なら記録して true、超えていれば記録せず false
create or replace function public.auth_rate_check(p_kind text, p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_kind is null or p_kind not in ('signup_ip', 'recover_ip', 'recover_id')
     or p_key is null or p_key !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 172800 then
    raise exception '不正なリクエストです' using errcode = '22023';
  end if;
  -- 同じキーの同時実行で上限をすり抜けないように直列化する
  perform pg_advisory_xact_lock(hashtext('auth_rate:' || p_kind || ':' || p_key));
  delete from private.auth_attempts where created_at < now() - interval '2 days';
  select count(*) into v_count
    from private.auth_attempts
    where kind = p_kind and key_hash = p_key
      and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into private.auth_attempts (kind, key_hash) values (p_kind, p_key);
  return true;
end;
$$;

-- 登録直後に呼ぶ: ユーザーIDと引き継ぎコードのハッシュを保存
create or replace function public.register_account(p_user_id uuid, p_login_id text, p_recovery_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (user_id, login_id, recovery_hash, recovery_issued_at)
  values (p_user_id, lower(p_login_id), p_recovery_hash, now());
end;
$$;

-- ユーザーIDと引き継ぎコードのハッシュが一致したら user_id を返す (一致しなければ null)
create or replace function public.verify_recovery(p_login_id text, p_recovery_hash text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.accounts
  where login_id = lower(p_login_id) and recovery_hash is not null and recovery_hash = p_recovery_hash;
$$;

-- 引き継ぎコードを新しいものに置き換える (使用後・作り直し)
create or replace function public.set_recovery_hash(p_user_id uuid, p_recovery_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.accounts set recovery_hash = p_recovery_hash, recovery_issued_at = now() where user_id = p_user_id;
  return found;
end;
$$;

-- 上の4関数はサーバー(service_role)専用。ブラウザ(anon / authenticated)からは呼べない
revoke execute on function public.auth_rate_check(text, text, int, int) from public, anon, authenticated;
revoke execute on function public.register_account(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.verify_recovery(text, text) from public, anon, authenticated;
revoke execute on function public.set_recovery_hash(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_rate_check(text, text, int, int) to service_role;
grant execute on function public.register_account(uuid, text, text) to service_role;
grant execute on function public.verify_recovery(text, text) to service_role;
grant execute on function public.set_recovery_hash(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 2a) ランク帯をまだ自分で選んでいないか (ユーザーID登録ではランク帯を聞かず、仮の値で作る)。
--     既存のプロフィールは選択済み (true)。初めて募集・参加するときに1タップで選んでもらう。
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists rank_confirmed boolean not null default true;
grant select (rank_confirmed) on public.profiles to authenticated;

create or replace function public.confirm_my_rank(p_rank_band text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if p_rank_band is null or p_rank_band not in ('fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p') then
    raise exception 'ランク帯を選んでください' using errcode = '22023';
  end if;
  update public.profiles set rank_band = p_rank_band, rank_confirmed = true where id = v_uid;
  if not found then
    raise exception '先に登録を完了してください' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.confirm_my_rank(text) from public, anon;
grant execute on function public.confirm_my_rank(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2b) メールアドレスで直接作られたアカウント (Supabase の signup API を直接呼んだもの) は
--     プロフィールを作れない。ユーザーID登録はサーバーが accounts を先に作るので通る。
--     Discord で入った人 (provider = discord) と既存のプロフィールには影響しない。
-- ---------------------------------------------------------------------
create or replace function private.require_account_for_email_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
       select 1 from auth.users u
       where u.id = new.id and coalesce(u.raw_app_meta_data ->> 'provider', '') = 'email'
     )
     and not exists (select 1 from public.accounts a where a.user_id = new.id) then
    raise exception 'このアカウントではプロフィールを作成できません。ユーザーIDで登録してください' using errcode = '42501';
  end if;
  -- ユーザーIDで登録した人は、ランク帯をまだ選んでいない状態で始まる
  if exists (select 1 from public.accounts a where a.user_id = new.id) then
    new.rank_confirmed := false;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_require_account on public.profiles;
create trigger profiles_require_account before insert on public.profiles
  for each row execute function private.require_account_for_email_users();

-- ---------------------------------------------------------------------
-- 3) 通報: 通報した時点で作成から24時間未満だったアカウントの通報は、
--    自動非表示の人数に数えない (通報自体は記録され、管理画面には出る)。
--    引数・戻り値は同じなので実行権限はそのまま引き継がれる。
-- ---------------------------------------------------------------------
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

  -- 未処理の通報のうち、通報時点で作成から24時間以上経っていたアカウントの通報者を数える
  select count(distinct rp.reporter_id) into v_count
  from public.reports rp
  join public.profiles pr on pr.id = rp.reporter_id
  where rp.target_type = p_target_type and rp.target_id = p_target_id
    and rp.resolved_at is null and rp.reporter_id <> v_owner
    and rp.created_at >= pr.created_at + interval '24 hours';

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
