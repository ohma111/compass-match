-- 最新のマイグレーション (2回) を流したあとの確認 (db-verify.sh から実行)
do $$ begin
  if (select string_agg(display_name || '=' || rank_band, ',' order by display_name)
      from public.profiles where display_name like '旧%')
     is distinct from '旧ba=fa,旧fc=fa,旧s10p=s8p,旧s1_3=s1_4,旧s4_6=s5_7,旧s7_9=s5_7' then
    raise exception 'ASSERT FAILED: profile rank bands not migrated: %',
      (select string_agg(display_name || '=' || rank_band, ',' order by display_name) from public.profiles where display_name like '旧%');
  end if;
  if (select string_agg(title || '=' || coalesce(min_rank, '-'), ',' order by title) from public.recruitments where title like '旧条件%')
     is distinct from '旧条件1=s5_7,旧条件2=s8p,旧条件3=-' then
    raise exception 'ASSERT FAILED: recruitment min_rank not migrated';
  end if;
  if exists (select 1 from public.profiles where rank_band not in ('fa', 's1_4', 's5_7', 's8p')) then
    raise exception 'ASSERT FAILED: old rank band left';
  end if;
  begin
    update public.profiles set rank_band = 's1_3' where display_name = '旧fc';
    raise exception 'ASSERT FAILED: old code accepted';
  exception when check_violation then null;
  end;
end $$;
-- 後のテストに影響しないよう片付ける
delete from public.recruitments where title like '旧条件%';
delete from auth.users where id::text like '00000000-0000-4000-8000-0000000000a%';
delete from public.profiles where display_name like '旧%';
select 'RANK MIGRATION OK' as result;
