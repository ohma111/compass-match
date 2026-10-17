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

-- v14
do $$
declare
  u_admin uuid := '20000000-0000-4000-8000-0000000000e1';
  u_a uuid := '20000000-0000-4000-8000-0000000000e2';
  u_b uuid := '20000000-0000-4000-8000-0000000000e3';
  r uuid;
begin
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (u_admin, 'https://127.0.0.1/x', 'k', 'a');
    raise exception 'ASSERT FAILED: bad endpoint accepted';
  exception when check_violation or foreign_key_violation then null;
  end;
  if not private.is_push_endpoint('https://web.push.apple.com/abc')
     or not private.is_push_endpoint('https://updates.push.services.mozilla.com/wpush/v2/x')
     or not private.is_push_endpoint('https://wns2-par02p.notify.windows.com/w/?token=x')
     or private.is_push_endpoint('https://fcm.googleapis.com.evil.com/x')
     or private.is_push_endpoint('http://fcm.googleapis.com/x') then
    raise exception 'ASSERT FAILED: push endpoint rule';
  end if;

  -- 運営の名前: 管理者以外は使えない。管理者は使えて、印が付く
  insert into auth.users (id) values (u_admin), (u_a), (u_b);
  insert into public.user_roles (user_id, role) values (u_admin, 'admin');
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (u_admin, 'JOIN COMPASS 運営', 's9', now(), 't');
  if not (select is_staff from public.profiles where id = u_admin) then
    raise exception 'ASSERT FAILED: admin not staff';
  end if;
  begin
    insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (u_a, 'ウンエイ', 's1', now(), 't');
    raise exception 'ASSERT FAILED: reserved name accepted';
  exception when others then
    if sqlerrm not like '%紛らわしい%' then raise; end if;
  end;
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (u_a, '遊ぶ人A', 's1', now(), 't');
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (u_b, '遊ぶ人B', 's1', now(), 't');
  begin
    update public.profiles set display_name = '公式スタッフ' where id = u_a;
    raise exception 'ASSERT FAILED: reserved rename accepted';
  exception when others then
    if sqlerrm not like '%紛らわしい%' then raise; end if;
  end;
  if (select is_staff from public.profiles where id = u_a) then
    raise exception 'ASSERT FAILED: non-admin staff';
  end if;
  insert into public.user_roles (user_id, role) values (u_a, 'admin');
  if not (select is_staff from public.profiles where id = u_a) then raise exception 'ASSERT FAILED: staff not synced on grant'; end if;
  delete from public.user_roles where user_id = u_a;
  if (select is_staff from public.profiles where id = u_a) then raise exception 'ASSERT FAILED: staff not synced on revoke'; end if;

  -- 一緒に遊んだ記録: 募集が消えたら一緒に消える
  insert into public.recruitments (owner_id, title, purpose, starts_at, ends_at, capacity, join_mode)
    values (u_b, 'v14の募集', 'enjoy', now(), now() + interval '1 hour', 3, 'instant') returning id into r;
  insert into public.participations (recruitment_id, user_id, status) values (r, u_a, 'approved');
  if (select count(*) from private.play_mates_counted where recruitment_id = r) <> 2 then
    raise exception 'ASSERT FAILED: play_mates_counted not recorded';
  end if;
  delete from public.recruitments where id = r;
  if exists (select 1 from private.play_mates_counted where recruitment_id = r) then
    raise exception 'ASSERT FAILED: play_mates_counted not cascaded';
  end if;

  delete from auth.users where id in (u_admin, u_a, u_b);
end $$;
select 'V14 MIGRATION OK' as result;


-- v17: 90分で閉じる・解散・90分で発言が消える
do $$
declare
  u uuid := '20000000-0000-4000-8000-0000000000f1';
  r uuid;
begin
  insert into auth.users (id) values (u);
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (u, '部屋の人', 's1', now(), 't');
  insert into public.recruitments (owner_id, title, purpose, starts_at, ends_at, capacity, join_mode)
    values (u, 'v17', 'enjoy', now(), now() + interval '90 minutes', 3, 'instant') returning id into r;
  update public.recruitments set ends_at = starts_at + interval '3 hours' where id = r;
  if (select ends_at - starts_at from public.recruitments where id = r) <> interval '90 minutes' then
    raise exception 'ASSERT FAILED: room longer than 90min';
  end if;
  insert into public.messages (recruitment_id, user_id, body, created_at) values (r, u, '古い', now() - interval '91 minutes'), (r, u, '新しい', now());
  perform private.purge_old_messages();
  if exists (select 1 from public.messages where recruitment_id = r and body = '古い')
     or not exists (select 1 from public.messages where recruitment_id = r and body = '新しい') then
    raise exception 'ASSERT FAILED: chat purge';
  end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform public.dissolve_recruitment(r);
  if (select status from public.recruitments where id = r) <> 'ended' then
    raise exception 'ASSERT FAILED: dissolve';
  end if;
  delete from auth.users where id = u;
end $$;
select 'V17 MIGRATION OK' as result;

-- v18: 新しい列と制約。既存の行は変わらない
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_level') then
    raise exception 'ASSERT FAILED: account_level missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recruitments' and column_name = 'end_warned_at') then
    raise exception 'ASSERT FAILED: end_warned_at missing';
  end if;
  if exists (select 1 from public.profiles where account_level is not null) then
    raise exception 'ASSERT FAILED: existing profiles got an account level';
  end if;
end $$;
select 'V18 MIGRATION OK' as result;
