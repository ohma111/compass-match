-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
select private.run_maintenance();
do $$ begin
  if (select count(*) from public.follows where follower_id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2') and active) <> 2 then
    raise exception 'ASSERT FAILED: play mates not followed';
  end if;
  if exists (select 1 from public.recruitments where title = '保存20日前') then
    raise exception 'ASSERT FAILED: 20 day old recruitment kept';
  end if;
  if exists (select 1 from public.messages where body = '古い発言') then
    raise exception 'ASSERT FAILED: chat older than 90 minutes kept';
  end if;
  -- ランクは空でもよい
  update public.profiles set rank_band = null where display_name = '遊び1';
end $$;
delete from public.recruitments where title like '保存%';
delete from public.profiles where display_name like '遊び%';
delete from auth.users where id::text like '00000000-0000-4000-8000-0000000000d%';
select 'V8 MIGRATION OK' as result;
