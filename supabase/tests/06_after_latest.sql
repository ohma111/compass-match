-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
select private.run_maintenance();
-- 守る対象は、直接消しても残る
delete from auth.users where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1';
delete from public.profiles where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1';
do $$ begin
  if not exists (select 1 from auth.users where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1') then
    raise exception 'ASSERT FAILED: protected auth user deleted';
  end if;
  if not exists (select 1 from public.profiles where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1') then
    raise exception 'ASSERT FAILED: protected profile deleted';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000d1') then
    raise exception 'ASSERT FAILED: inactive user kept';
  end if;
  if (select coalesce(sum(n), 0) from public.recruitment_stats_daily where purpose = 'rank' and outcome = 'filled') <> 1 then
    raise exception 'ASSERT FAILED: deleted recruitment not archived';
  end if;
end $$;
delete from public.recruitment_stats_daily;
delete from private.protected_users where user_id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1';
delete from public.profiles where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1';
delete from auth.users where id = 'a785dedf-d035-424b-ae1c-16c9f61d37d1';
-- 本番用の守る対象を戻す (この後のテストでは使わない)
insert into private.protected_users (user_id, note) values ('a785dedf-d035-424b-ae1c-16c9f61d37d1', 'test') on conflict do nothing;
select 'V9 MIGRATION OK' as result;
