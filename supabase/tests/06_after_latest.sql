-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
do $$ begin
  if private.rank_value('a') <> 0 or private.rank_value('s9') <> 9 then
    raise exception 'ASSERT FAILED: rank_value';
  end if;
end $$;
select 'V11 MIGRATION OK' as result;
