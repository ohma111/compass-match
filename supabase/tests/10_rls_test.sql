-- ローカル検証専用: RLS と RPC の振る舞いテスト (scripts/db-verify.sh から実行)
-- seed.sql 投入後に実行する。失敗時は例外で停止する。

-- 追加のテストユーザー
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000009');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-000000000004', 'テスト4', 'fc', now(), 't'),
  ('00000000-0000-4000-8000-000000000005', 'テスト5', 'fc', now(), 't'),
  ('00000000-0000-4000-8000-000000000009', '管理者', 'fc', now(), 't');
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-000000000009', 'admin');

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create or replace function pg_temp.expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'ASSERT FAILED (expected error): %', msg;
end $$;

-- 定数
\set R1 '''10000000-0000-4000-8000-000000000001'''
\set U1 '''00000000-0000-4000-8000-000000000001'''
\set U2 '''00000000-0000-4000-8000-000000000002'''
\set U3 '''00000000-0000-4000-8000-000000000003'''
\set U4 '''00000000-0000-4000-8000-000000000004'''
\set U5 '''00000000-0000-4000-8000-000000000005'''
\set ADM '''00000000-0000-4000-8000-000000000009'''

-- 1. 未ログインでも募集一覧は見えるが、部屋番号・連絡先テーブルは見えない
select pg_temp.as_user(null);
select pg_temp.assert((select count(*) from public.recruitments) = 2, 'anon sees recruitments');
select pg_temp.expect_error('select * from public.recruitment_secrets', 'anon cannot read secrets');
select pg_temp.expect_error('select * from public.profile_contacts', 'anon cannot read contacts');
select pg_temp.expect_error('select * from public.profiles', 'anon cannot read all profile columns');
select pg_temp.expect_error('select bio from public.profiles', 'anon cannot read bio');
select pg_temp.assert((select count(*) from public.recruitments r join public.profiles p on p.id = r.owner_id) = 2, 'anon can read owner names for list');
reset role;

-- 2. 未承認ユーザーには部屋番号・連絡先が見えない
select pg_temp.as_user(:U2);
select pg_temp.assert(public.get_room_code(:R1) is null, 'non-member gets no room code');
select pg_temp.assert((select count(*) from public.get_member_contacts(:R1)) = 0, 'non-member gets no contacts');
select pg_temp.assert((select count(*) from public.profile_contacts) = 1, 'user sees only own contacts row');
select pg_temp.expect_error('select * from public.recruitment_secrets', 'authenticated cannot read secrets directly');
select pg_temp.expect_error($$update public.recruitments set capacity = 6$$, 'no direct update');
select pg_temp.expect_error($$insert into public.messages (recruitment_id, user_id, body) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'hi')$$, 'no direct insert of messages');
select pg_temp.expect_error($$select signup_src from public.profiles$$, 'signup_src not readable');

-- 3. 申請 -> 承認前はチャット不可
select public.request_join(:R1, 'guild');
select pg_temp.expect_error($$select public.send_message('10000000-0000-4000-8000-000000000001', 'こんにちは')$$, 'pending cannot chat');
reset role;

-- 4. 他人は承認できない / 募集者は承認できる
select pg_temp.as_user(:U3);
select pg_temp.expect_error($$select public.decide_participation((select id from public.participations limit 1), 'approved')$$, 'non-owner cannot approve');
reset role;
select pg_temp.as_user(:U1);
select public.decide_participation(
  (select id from public.participations where user_id = :U2 and recruitment_id = :R1), 'approved');
reset role;
select pg_temp.assert((select approved_count from public.recruitments where id = :R1) = 1, 'approved_count=1');
select pg_temp.assert((select src from public.participations where user_id = :U2) = 'guild', 'src stored');

-- 5. 承認後は部屋番号と募集者の連絡先が見える
select pg_temp.as_user(:U2);
select pg_temp.assert(public.get_room_code(:R1) = '12345', 'member sees room code');
select pg_temp.assert((select contact_discord from public.get_member_contacts(:R1) where is_owner) = 'seed_owner', 'member sees owner contacts');
select public.send_message(:R1, 'よろしくお願いします');
-- URLは拒否
select pg_temp.expect_error($$select public.send_message('10000000-0000-4000-8000-000000000001', 'example.com みて')$$, 'url rejected');
-- 連投制限
select pg_temp.expect_error($$select public.send_message('10000000-0000-4000-8000-000000000001', 'もう一回')$$, 'rate limited');
-- 300字超過
select pg_temp.expect_error($$select public.send_message('10000000-0000-4000-8000-000000000001', repeat('あ', 301))$$, 'too long');
select pg_temp.assert((select count(*) from public.messages where recruitment_id = :R1) = 1, 'member sees messages');
reset role;

-- 6. 非メンバーはメッセージを見られない
select pg_temp.as_user(:U3);
select pg_temp.assert((select count(*) from public.messages) = 0, 'non-member sees no messages');
reset role;

-- 7. 定員: capacity=3 なので承認はあと1人。3人目は満員
select pg_temp.as_user(:U3); select public.request_join(:R1, null); reset role;
select pg_temp.as_user(:U4); select public.request_join(:R1, 'x'); reset role;
select pg_temp.as_user(:U1);
select public.decide_participation((select id from public.participations where user_id = :U3 and recruitment_id = :R1), 'approved');
select pg_temp.assert((select count(*) from public.get_member_contacts(:R1)) = 2, 'owner sees both participants');
reset role;
select pg_temp.as_user(:U3);
select pg_temp.assert((select count(*) from public.get_member_contacts(:R1)) = 1, 'participant sees only owner contacts');
select pg_temp.assert((select bool_and(is_owner) from public.get_member_contacts(:R1)), 'only owner row');
reset role;
select pg_temp.as_user(:U1);
select pg_temp.expect_error($$select public.decide_participation((select id from public.participations where user_id = '00000000-0000-4000-8000-000000000004'), 'approved')$$, 'over capacity');
reset role;
select pg_temp.assert((select status from public.recruitments where id = :R1) = 'full', 'status full');

-- 参加者が取り消すと open に戻る
select pg_temp.as_user(:U3); select public.cancel_participation(:R1); reset role;
select pg_temp.assert((select status from public.recruitments where id = :R1) = 'open', 'status open again');
select pg_temp.assert((select approved_count from public.recruitments where id = :R1) = 1, 'count back to 1');

-- 8. ブロック: U4 が U1 をブロック -> U4 から U1 の募集が見えない、U4 の申請は取り消し
select pg_temp.as_user(:U4);
select public.block_user(:U1);
select pg_temp.assert((select count(*) from public.recruitments where owner_id = :U1) = 0, 'blocked owner recruitments hidden');
select pg_temp.expect_error($$select public.request_join('10000000-0000-4000-8000-000000000001', null)$$, 'blocked cannot join');
reset role;
select pg_temp.assert((select status from public.participations where user_id = :U4 and recruitment_id = :R1) = 'cancelled', 'blocked pending cancelled');

-- 9. 通報: 同一通報者の重複はカウントせず、異なる3人で自動非表示
select pg_temp.as_user(:U2);
select pg_temp.assert(public.submit_report('recruitment', :R1, '不適切') = false, '1st report no hide');
select pg_temp.assert(public.submit_report('recruitment', :R1, '不適切(再)') = false, 'duplicate no hide');
reset role;
select pg_temp.assert((select count(*) from public.reports where target_id = :R1) = 1, 'duplicate collapsed');
select pg_temp.as_user(:U3);
select pg_temp.assert(public.submit_report('recruitment', :R1, '荒らし') = false, '2nd reporter no hide');
reset role;
-- 募集者本人は自分を通報できない
select pg_temp.as_user(:U1);
select pg_temp.expect_error($$select public.submit_report('recruitment', '10000000-0000-4000-8000-000000000001', 'x')$$, 'self report rejected');
reset role;
select pg_temp.as_user(:U5);
select pg_temp.assert(public.submit_report('recruitment', :R1, 'スパム') = true, '3rd distinct reporter hides');
select pg_temp.assert((select count(*) from public.recruitments where id = :R1) = 0, 'hidden recruitment invisible to others');
reset role;
select pg_temp.as_user(null);
select pg_temp.assert((select count(*) from public.recruitments where id = :R1) = 0, 'hidden recruitment invisible to anon');
reset role;
select pg_temp.as_user(:U2);
select pg_temp.assert((select count(*) from public.recruitments where id = :R1) = 1, 'approved member still sees hidden recruitment');
reset role;

-- 10. 管理者機能
select pg_temp.as_user(:U2);
select pg_temp.expect_error($$select * from public.admin_report_summary()$$, 'non-admin cannot view reports');
select pg_temp.expect_error($$select public.admin_set_user_state('00000000-0000-4000-8000-000000000003', 'ban')$$, 'non-admin cannot ban');
reset role;
select pg_temp.as_user(:ADM);
select pg_temp.assert((select reporter_count from public.admin_report_summary() where target_id = :R1) = 3, 'admin sees 3 reporters');
select public.admin_set_user_state(:U3, 'ban');
select pg_temp.assert(public.admin_metrics() ? 'approved_by_src', 'metrics available');
select public.admin_resolve_target('recruitment', :R1, true);
reset role;
select pg_temp.as_user(:U3);
select pg_temp.expect_error($$select public.request_join('10000000-0000-4000-8000-000000000001', null)$$, 'banned cannot join');
reset role;
select pg_temp.as_user(:U2);
select pg_temp.assert((select count(*) from public.profiles where id = :U3) = 0, 'banned profile hidden');
reset role;

-- 11. チャット自動削除: 終了6時間後に削除される
update public.recruitments set starts_at = now() - interval '9 hours', ends_at = now() - interval '7 hours' where id = :R1;
select pg_temp.as_user(:U2);
select pg_temp.assert((select count(*) from public.messages where recruitment_id = :R1) = 0, 'expired chat not visible');
reset role;
select private.run_maintenance();
select pg_temp.assert((select count(*) from public.messages where recruitment_id = :R1) = 0, 'expired chat deleted');
select pg_temp.assert((select status from public.recruitments where id = :R1) = 'ended', 'auto ended');

-- 12. フィードバックは未ログインでも送れるが、読めない
select pg_temp.as_user(null);
select public.submit_feedback('とても良い', '/');
select pg_temp.expect_error('select * from public.feedback', 'anon cannot read feedback');
reset role;
select pg_temp.as_user(:ADM);
select pg_temp.assert((select count(*) from public.feedback) = 1, 'admin reads feedback');
reset role;

-- 13. プロフィール作成には同意が必要。URL入りの自己紹介は拒否
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000006');
select pg_temp.as_user('00000000-0000-4000-8000-000000000006');
select pg_temp.expect_error($$select public.save_my_profile('新人', 'fc', '{}', '{}', '{}', 'no', '{}', '', null, null, null, false, 'v1')$$, 'terms required');
select pg_temp.expect_error($$select public.save_my_profile('新人', 'fc', '{}', '{}', '{}', 'no', '{}', 'https://x.test', null, null, null, true, 'v1')$$, 'url bio rejected');
select public.save_my_profile('新人', 'fc', '{tank}', '{}', '{enjoy}', 'no', '{relaxed}', 'よろしく', null, 'new_user', null, true, 'v1', 'yt');
reset role;
select pg_temp.assert((select signup_src from public.profiles where id = '00000000-0000-4000-8000-000000000006') = 'yt', 'signup src stored');

select 'ALL RLS TESTS PASSED' as result;
