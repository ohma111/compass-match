-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
select private.run_maintenance();
do $$ begin
  if (select string_agg(title, ',' order by title) from public.recruitments where title like '片付け%')
     is distinct from '片付け最近,片付け通報あり' then
    raise exception 'ASSERT FAILED: old recruitments: %',
      (select string_agg(title, ',' order by title) from public.recruitments where title like '片付け%');
  end if;
  if (select string_agg(right(id::text, 2), ',' order by id) from auth.users where id::text like '00000000-0000-4000-8000-0000000000b%')
     is distinct from 'b1,b3,b4' then
    raise exception 'ASSERT FAILED: anonymous cleanup: %',
      (select string_agg(right(id::text, 2), ',' order by id) from auth.users where id::text like '00000000-0000-4000-8000-0000000000b%');
  end if;
  if (select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-0000000000b1') <> 1 then
    raise exception 'ASSERT FAILED: notification cleanup';
  end if;
  if not has_column_privilege('anon', 'public.profiles', 'play_roles', 'select') then
    raise exception 'ASSERT FAILED: anon cannot read play_roles';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'banned_at', 'select') then
    raise exception 'ASSERT FAILED: anon can read banned_at';
  end if;
end $$;
-- 後のテストに影響しないよう片付ける
delete from public.recruitments where title like '片付け%';
delete from public.reports where reason = 'テスト';
delete from public.profiles where display_name like '片付け%';
delete from auth.users where id::text like '00000000-0000-4000-8000-0000000000b%';
select 'MAINTENANCE OK' as result;
