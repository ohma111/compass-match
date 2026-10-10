-- =====================================================================
-- チャットの即時配信を postgres_changes から Broadcast (中身のない合図) に変えたので、
-- messages を Realtime の配信対象から外す。
-- pg_stat_statements で、Realtime が DB の変更を読み続ける問い合わせ (realtime.list_changes) が
-- DB の CPU 時間の6割以上を使っていた (6万回・計385秒)。
-- 古い画面を開いたままの方は、次の読み込みまで20秒ごとの確認で新しい発言を受け取る。
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。20 とは独立。
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'notifications'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end;
$$;
