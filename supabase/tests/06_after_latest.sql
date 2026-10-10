-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
-- v12: 一緒に遊んだ人は新しい10人だけ残る
do $$
declare i int;
begin
  insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f0');
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values ('00000000-0000-4000-8000-0000000000f0', '遊んだ本人', 's5', now(), 't');
  for i in 1..12 loop
    insert into auth.users (id) values (('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid);
    insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version)
      values (('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, '相手' || i, 's1', now(), 't');
    insert into public.play_mates (user_id, mate_id, last_played_at)
      values ('00000000-0000-4000-8000-0000000000f0', ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, now() - make_interval(mins => i));
  end loop;
  perform private.run_maintenance();
  if (select count(*) from public.play_mates where user_id = '00000000-0000-4000-8000-0000000000f0') <> 10 then
    raise exception 'ASSERT FAILED: play mates not trimmed to 10';
  end if;
  if exists (select 1 from public.play_mates where user_id = '00000000-0000-4000-8000-0000000000f0' and mate_id = '00000000-0000-4000-8000-000000000112') then
    raise exception 'ASSERT FAILED: oldest mate kept';
  end if;
  delete from public.profiles where display_name like '相手%' or display_name = '遊んだ本人';
  delete from auth.users where id::text like '00000000-0000-4000-8000-0000000001%' or id = '00000000-0000-4000-8000-0000000000f0';
end $$;
select 'V12 MIGRATION OK' as result;

-- v15: 自動のお気に入りはオフ、自分で付けたものは残る
do $$
begin
  if (select count(*) from public.follows where follower_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2') and active) <> 0 then
    raise exception 'ASSERT FAILED: auto follows still on';
  end if;
  if not (select active from public.follows where follower_id = '00000000-0000-4000-8000-0000000000a3') then
    raise exception 'ASSERT FAILED: manual follow turned off';
  end if;
  delete from public.profiles where id::text like '00000000-0000-4000-8000-0000000000a%';
  delete from auth.users where id::text like '00000000-0000-4000-8000-0000000000a%';
end $$;
select 'V15 MIGRATION OK' as result;
