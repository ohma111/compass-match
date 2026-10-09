-- =====================================================================
-- 負荷を減らす (2026-10-09 夜のダウンの対策 その2)
-- 1) ヘッダー用の読み込み (プロフィール・管理者か・未読数・Discord の有無) を1回の問い合わせにまとめる
--    前はページを開くたびに4回 (PostgREST への往復も4回) だった。アプリは関数がなければ前のやり方に戻る。
-- 2) 誰も Realtime で受け取っていない notifications を配信の対象から外す (変更の読み取りが無駄に動いていた)
-- 3) 管理画面の「容量を詰める」(VACUUM FULL) をやめる。実行中は全テーブルが止まり、混雑時はサイト全体が止まる。
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。19 とは独立 (どの順でもよい)。
-- =====================================================================

-- 1) 列は src/lib/profile-columns.ts の PROFILE_COLUMNS と同じにすること
create or replace function public.viewer_header()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, rank_band, play_roles, characters, purposes, vc, tags, bio,
               hidden_at, suspended_at, banned_at, created_at, rank_confirmed, avatar
        from public.profiles where id = (select auth.uid())
      ) p
    ),
    'is_admin', exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'),
    'unread', (select count(*) from public.notifications where user_id = (select auth.uid()) and read_at is null),
    'has_discord', coalesce((
      select coalesce(contact_discord, '') <> '' from public.profile_contacts where user_id = (select auth.uid())
    ), false)
  );
$$;
revoke execute on function public.viewer_header() from public, anon;
grant execute on function public.viewer_header() to authenticated;

-- 2)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end;
$$;

-- 3)
do $$
begin
  perform cron.unschedule('admin-compact');
exception when others then
  null;
end;
$$;
create or replace function public.admin_compact()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  raise exception '容量を詰める操作は廃止しました (自動の VACUUM で足ります)';
end;
$$;
