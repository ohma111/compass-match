-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
do $$ begin
  if (select string_agg(display_name || '=' || rank_band || ':' || rank_confirmed::text, ',' order by display_name)
      from public.profiles where display_name like '帯%')
     is distinct from '帯fa=a:false,帯s1_4=s1:false,帯s5_7=s5:false,帯s8p=s8:false' then
    raise exception 'ASSERT FAILED: ranks not migrated: %',
      (select string_agg(display_name || '=' || rank_band || ':' || rank_confirmed::text, ',' order by display_name) from public.profiles where display_name like '帯%');
  end if;
  if (select string_agg(title || '=' || coalesce(min_rank, '-'), ',' order by title) from public.recruitments where title like '帯条件%')
     is distinct from '帯条件fa=-,帯条件s5_7=s5' then
    raise exception 'ASSERT FAILED: min_rank not migrated';
  end if;
  begin
    update public.profiles set rank_band = 's5_7' where display_name = '帯fa';
    raise exception 'ASSERT FAILED: old band accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set rank_band = 's10' where display_name = '帯fa';
    raise exception 'ASSERT FAILED: s10 accepted';
  exception when check_violation then null;
  end;
end $$;
delete from public.recruitments where title like '帯条件%';
delete from public.profiles where display_name like '帯%';
delete from auth.users where id::text like '00000000-0000-4000-8000-0000000000c%';
select 'RANK MIGRATION OK' as result;
