-- =====================================================================
-- 設定値の初期投入と定期ジョブ
-- =====================================================================

insert into public.app_settings (key, value) values
  ('report_auto_hide_threshold', '3'),
  ('chat_retention_hours', '6')
on conflict (key) do nothing;

-- pg_cron で5分ごとにメンテナンスを実行する。
-- Supabase では pg_cron 拡張は無料プランでも利用可能。
-- 拡張が使えない環境(ローカル検証用の素のPostgres等)ではスキップする。
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('compass-maintenance', '*/5 * * * *', 'select private.run_maintenance()');
  else
    raise notice 'pg_cron が利用できないため定期ジョブを登録しませんでした';
  end if;
end;
$$;
