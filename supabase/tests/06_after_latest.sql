-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
do $$ begin
  if (select rank_band from public.profiles where id = '00000000-0000-4000-8000-0000000000e1') <> 'a' then
    raise exception 'ASSERT FAILED: rank c not merged into a';
  end if;
  if (select min_rank from public.recruitments where id = '30000000-0000-4000-8000-0000000000e1') is not null then
    raise exception 'ASSERT FAILED: min rank b not cleared';
  end if;
end $$;
delete from public.recruitments where id = '30000000-0000-4000-8000-0000000000e1';
delete from public.recruitment_stats_daily;
delete from public.profiles where id = '00000000-0000-4000-8000-0000000000e1';
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e1';
select 'V10 MIGRATION OK' as result;
