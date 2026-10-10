-- ローカル検証専用: RLS と RPC の振る舞いテスト (scripts/db-verify.sh から実行)
-- seed.sql 投入後に実行する。失敗時は例外で停止する。

-- 追加のテストユーザー
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000009');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-000000000004', 'テスト4', 'a', now(), 't'),
  ('00000000-0000-4000-8000-000000000005', 'テスト5', 'a', now(), 't'),
  ('00000000-0000-4000-8000-000000000009', '管理者', 'a', now(), 't');
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

-- v3: 自動非表示の人数は「通報時点で作成から24時間以上のアカウント」だけを数えるため、
-- ここまでに作ったテスト用プロフィールは3日前に作成されたことにする (15. で新しいアカウントを別に確認する)
update public.profiles set created_at = now() - interval '3 days';

-- 0. v3 回帰テスト: profiles を select('*') 相当で読むと権限エラー (signup_src に列権限がない)。
--    アプリが使う列リスト (src/lib/profile-columns.ts の PROFILE_SELECT) なら読める。
create or replace function pg_temp.count_profiles_with(cols text, uid uuid) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from (select %s from public.profiles where id = %L) s', cols, uid) into n;
  return n;
end $f$;
select pg_temp.as_user(:U2);
select pg_temp.expect_error('select * from public.profiles', 'authenticated select(*) on profiles fails (column privilege)');
select pg_temp.assert(pg_temp.count_profiles_with(:'profile_cols', :U2) = 1, 'app column list reads own profile');
select pg_temp.assert(pg_temp.count_profiles_with(:'profile_cols', :U1) = 1, 'app column list reads other profile');
select pg_temp.assert(position('signup_src' in :'profile_cols') = 0, 'app column list excludes signup_src');
reset role;

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
select pg_temp.assert(public.get_room_code(:R1) = '1234', 'member sees room code');
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
select pg_temp.expect_error($$select public.save_my_profile('新人', 'a', '{}', '{}', '{}', 'no', '{}', '', null, null, null, false, 'v1')$$, 'terms required');
select pg_temp.expect_error($$select public.save_my_profile('新人', 'a', '{}', '{}', '{}', 'no', '{}', 'https://x.test', null, null, null, true, 'v1')$$, 'url bio rejected');
select public.save_my_profile('新人', 'a', '{tank}', '{}', '{enjoy}', 'no', '{relaxed}', 'よろしく', null, 'new_user', null, true, 'v1', 'yt');
reset role;
select pg_temp.assert((select signup_src from public.profiles where id = '00000000-0000-4000-8000-000000000006') = 'yt', 'signup src stored');

-- 14. v2: 参加方式 (join_mode)
select pg_temp.assert((select column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'recruitments' and column_name = 'join_mode') like '''instant''%', 'join_mode defaults to instant');
select pg_temp.assert((select join_mode from public.recruitments where id = :R1) = 'approval', 'seeded approval recruitment kept');
select pg_temp.expect_error($$insert into public.recruitments (owner_id, title, purpose, starts_at, ends_at, capacity, join_mode)
  values ('00000000-0000-4000-8000-000000000005', 'x', 'enjoy', now(), now() + interval '1 hour', 3, 'auto')$$, 'join_mode check constraint');

-- 未ログインでは作成できない
select pg_temp.as_user(null);
select pg_temp.expect_error($$select public.create_recruitment('x', 'enjoy', now(), now() + interval '1 hour', 3, null, 'any', '{}', '', null)$$, 'anon cannot create');
reset role;

select pg_temp.as_user(:U5);
-- カスタム以外は3人まで / カスタムは6人まで / 不正な参加方式は拒否
select pg_temp.expect_error($$select public.create_recruitment('x', 'enjoy', now(), now() + interval '1 hour', 4, null, 'any', '{}', '', null)$$, 'party capacity max 3');
select pg_temp.expect_error($$select public.create_recruitment('x', 'rank', now(), now() + interval '1 hour', 3, null, 'any', '{}', '', null, null, 'auto')$$, 'bad join mode');
select public.create_recruitment('カスタム 6人', 'custom', now(), now() + interval '1 hour', 6, null, 'any', '{}', '', null, null, 'approval');
-- 引数を省略すると早い者勝ち
select public.create_recruitment('ランク S4〜 あと2人', 'rank', now() + interval '10 minutes', now() + interval '70 minutes', 3, null, 'on', '{serious}', '', '7777', 'x');
reset role;
\set RI '(select id from public.recruitments where title = ''ランク S4〜 あと2人'')'
\set RA '(select id from public.recruitments where title = ''カスタム 6人'')'
select pg_temp.assert((select join_mode from public.recruitments where id = :RI) = 'instant', 'default instant via rpc');
select pg_temp.assert((select join_mode from public.recruitments where id = :RA) = 'approval', 'approval via rpc');
select pg_temp.assert((select src from public.recruitments where id = :RI) = 'x', 'recruitment src stored');

-- 早い者勝ち: 申請なしで即参加、募集者に joined 通知、部屋番号が見える
select pg_temp.as_user(:U2);
select public.request_join(:RI, 'x');
select pg_temp.assert((select status from public.participations where recruitment_id = :RI and user_id = :U2) = 'approved', 'instant join approved');
select pg_temp.assert(public.get_room_code(:RI) = '7777', 'instant member sees room code');
select public.request_join(:RI, null);
reset role;
select pg_temp.assert((select approved_count from public.recruitments where id = :RI) = 1, 'instant count 1 (idempotent)');
select pg_temp.assert((select count(*) from public.notifications where user_id = :U5 and recruitment_id = :RI and kind = 'joined') = 1, 'owner notified joined');
select pg_temp.assert((select decided_at is not null from public.participations where recruitment_id = :RI and user_id = :U2), 'instant decided_at set');

insert into auth.users (id) values ('00000000-0000-4000-8000-000000000007');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version)
  values ('00000000-0000-4000-8000-000000000007', 'テスト7', 's5', now(), 't');
select pg_temp.as_user('00000000-0000-4000-8000-000000000006');
select public.request_join(:RI, null);
reset role;
select pg_temp.assert((select status from public.recruitments where id = :RI) = 'full', 'instant fills to full');
select pg_temp.assert((select filled_at is not null from public.recruitments where id = :RI), 'filled_at set');
select pg_temp.as_user('00000000-0000-4000-8000-000000000007');
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'ランク S4〜 あと2人'), null)$$, 'instant full rejects');
reset role;

-- 参加者が抜けると再び参加可能。募集者は外せる(外された人は再参加不可)
select pg_temp.as_user(:U2); select public.cancel_participation(:RI); reset role;
select pg_temp.assert((select status from public.recruitments where id = :RI) = 'open', 'open after cancel');
select pg_temp.as_user('00000000-0000-4000-8000-000000000007');
select public.request_join(:RI, null);
reset role;
select pg_temp.assert((select approved_count from public.recruitments where id = :RI) = 2, 'rejoin fills');
select pg_temp.as_user(:U5);
select public.decide_participation((select id from public.participations where recruitment_id = :RI and user_id = '00000000-0000-4000-8000-000000000007'), 'rejected');
reset role;
select pg_temp.assert((select approved_count from public.recruitments where id = :RI) = 1, 'owner removed participant');
select pg_temp.assert((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000007' and kind = 'removed') = 1, 'removed notified');
select pg_temp.as_user('00000000-0000-4000-8000-000000000007');
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'ランク S4〜 あと2人'), null)$$, 'removed cannot rejoin');
select pg_temp.assert(public.get_room_code(:RI) is null, 'removed loses room code');
reset role;

-- 承認制: pending のまま。募集者に join_request 通知
select pg_temp.as_user('00000000-0000-4000-8000-000000000007');
select public.request_join(:RA, null);
reset role;
select pg_temp.assert((select status from public.participations where recruitment_id = :RA) = 'pending', 'approval stays pending');
select pg_temp.assert((select approved_count from public.recruitments where id = :RA) = 0, 'approval count unchanged');
select pg_temp.assert((select count(*) from public.notifications where user_id = :U5 and recruitment_id = :RA and kind = 'join_request') = 1, 'owner notified request');

-- 15. v3: ユーザーID・引き継ぎコード (サーバーの service_role 専用関数)
\set H1 '''1111111111111111111111111111111111111111111111111111111111111111'''
\set H2 '''2222222222222222222222222222222222222222222222222222222222222222'''
\set P1 '''00000000-0000-4000-8000-000000000010'''
\set P2 '''00000000-0000-4000-8000-000000000011'''
insert into auth.users (id) values (:P1), (:P2);

-- ブラウザ側のロール (anon / authenticated) からは呼べない
select pg_temp.as_user(:U2);
select pg_temp.expect_error($$select public.auth_rate_check('signup_ip', repeat('a', 64), 3, 3600)$$, 'authenticated cannot call auth_rate_check');
select pg_temp.expect_error($$select public.register_account('00000000-0000-4000-8000-000000000011', 'hijack', repeat('a', 64))$$, 'authenticated cannot register_account');
select pg_temp.expect_error($$select public.verify_recovery('seed', repeat('a', 64))$$, 'authenticated cannot verify_recovery');
select pg_temp.expect_error($$select public.set_recovery_hash('00000000-0000-4000-8000-000000000002', repeat('a', 64))$$, 'authenticated cannot set_recovery_hash');
reset role;
select pg_temp.as_user(null);
select pg_temp.expect_error($$select public.auth_rate_check('signup_ip', repeat('a', 64), 3, 3600)$$, 'anon cannot call auth_rate_check');
select pg_temp.expect_error($$select public.verify_recovery('seed', repeat('a', 64))$$, 'anon cannot verify_recovery');
select pg_temp.expect_error('select login_id from public.accounts', 'anon cannot read accounts');
reset role;

set role service_role;
-- レート制限: 上限まで true、超えたら false。キーごとに独立。不正な引数は拒否
select pg_temp.assert(public.auth_rate_check('signup_ip', repeat('a', 64), 2, 3600), 'rate 1st ok');
select pg_temp.assert(public.auth_rate_check('signup_ip', repeat('a', 64), 2, 3600), 'rate 2nd ok');
select pg_temp.assert(public.auth_rate_check('signup_ip', repeat('a', 64), 2, 3600) = false, 'rate 3rd blocked');
select pg_temp.assert(public.auth_rate_check('signup_ip', repeat('b', 64), 2, 3600), 'other key independent');
select pg_temp.assert(public.auth_rate_check('recover_id', repeat('a', 64), 2, 3600), 'other kind independent');
select pg_temp.expect_error($$select public.auth_rate_check('other', repeat('a', 64), 2, 3600)$$, 'unknown kind rejected');
select pg_temp.expect_error($$select public.auth_rate_check('signup_ip', '1.2.3.4', 2, 3600)$$, 'raw ip rejected (hash only)');

-- 登録: ユーザーIDは小文字で一意。形式違反は拒否
select public.register_account(:P1, 'Player_One', :H1);
reset role;
select pg_temp.assert((select login_id from public.accounts where user_id = :P1) = 'player_one', 'login id stored lowercase');
set role service_role;
select pg_temp.expect_error($$select public.register_account('00000000-0000-4000-8000-000000000011', 'PLAYER_one', repeat('3', 64))$$, 'login id unique (case-insensitive)');
select pg_temp.expect_error($$select public.register_account('00000000-0000-4000-8000-000000000011', 'ab', repeat('3', 64))$$, 'login id too short');
select pg_temp.expect_error($$select public.register_account('00000000-0000-4000-8000-000000000011', 'あいう', repeat('3', 64))$$, 'login id charset');
select pg_temp.expect_error($$select public.register_account('00000000-0000-4000-8000-000000000011', 'player_two', 'plain-code')$$, 'recovery stored as hash only');

-- 引き継ぎコード: 一致したときだけ user_id。作り直すと古いコードは使えない
select pg_temp.assert(public.verify_recovery('PLAYER_ONE', :H1) = :P1, 'recovery code verifies');
select pg_temp.assert(public.verify_recovery('player_one', :H2) is null, 'wrong code rejected');
select pg_temp.assert(public.verify_recovery('nobody', :H1) is null, 'unknown id rejected');
select pg_temp.assert(public.set_recovery_hash(:P1, :H2), 'rotate code');
select pg_temp.assert(public.verify_recovery('player_one', :H1) is null, 'old code invalid after rotate');
select pg_temp.assert(public.verify_recovery('player_one', :H2) = :P1, 'new code valid');
reset role;

-- 本人は自分のユーザーIDだけ読める。ハッシュは本人にも見えない
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (:P1, 'プレイヤー1', 's1', now(), 't');
select pg_temp.as_user(:P1);
select pg_temp.assert((select login_id from public.accounts) = 'player_one', 'owner reads own login id');
select pg_temp.expect_error('select recovery_hash from public.accounts', 'recovery hash not readable');
select pg_temp.expect_error('select * from public.accounts', 'select * on accounts fails');
select pg_temp.expect_error($$update public.accounts set login_id = 'taken'$$, 'no direct update of accounts');
reset role;
select pg_temp.as_user(:U2);
select pg_temp.assert((select count(*) from public.accounts) = 0, 'others cannot see login ids');
reset role;
-- アカウントを消すとユーザーIDも消える
delete from auth.users where id = :P1;
select pg_temp.assert((select count(*) from public.accounts where user_id = :P1) = 0, 'account row cascades');

-- 15b. Supabase の signup API を直接呼んで作ったメールアカウントは、accounts がないとプロフィールを作れない
insert into auth.users (id, raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000000012', '{"provider":"email","providers":["email"]}'),
  ('00000000-0000-4000-8000-000000000013', '{"provider":"email","providers":["email"]}'),
  ('00000000-0000-4000-8000-000000000014', '{"provider":"discord","providers":["discord"]}');
select pg_temp.as_user('00000000-0000-4000-8000-000000000012');
select pg_temp.expect_error($$select public.save_my_profile('直接', 'a', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3')$$, 'email user without account cannot create profile');
reset role;
set role service_role;
select public.register_account('00000000-0000-4000-8000-000000000013', 'player_three', repeat('4', 64));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000013');
select public.save_my_profile('ID登録', 'a', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000014');
select public.save_my_profile('Discord', 'a', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3');
reset role;
select pg_temp.assert((select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000014')) = 2, 'id-registered and discord users can create profiles');
select pg_temp.assert((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000012') = 0, 'no profile for raw email signup');
-- ユーザーIDで登録した人はランク帯が未確定で始まり、confirm_my_rank で確定する。Discord の人は確定済み
select pg_temp.assert((select rank_confirmed from public.profiles where id = '00000000-0000-4000-8000-000000000013') = false, 'id signup starts with unconfirmed rank');
select pg_temp.assert((select rank_confirmed from public.profiles where id = '00000000-0000-4000-8000-000000000014') = true, 'discord signup rank confirmed');
select pg_temp.as_user('00000000-0000-4000-8000-000000000013');
select pg_temp.expect_error($$select public.confirm_my_rank('zz')$$, 'invalid rank rejected');
select public.confirm_my_rank('s6');
select pg_temp.assert((select rank_confirmed and rank_band = 's6' from public.profiles where id = '00000000-0000-4000-8000-000000000013'), 'rank confirmed');
reset role;
select pg_temp.as_user(null);
select pg_temp.expect_error($$select public.confirm_my_rank('a')$$, 'anon cannot confirm rank');
reset role;

-- 16. v3: 通報時点で作成24時間未満のアカウントの通報は自動非表示の人数に数えない
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000021'), ('00000000-0000-4000-8000-000000000022');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-000000000021', '新規1', 'a', now(), 't'),
  ('00000000-0000-4000-8000-000000000022', '新規2', 'a', now(), 't');
insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity)
values ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000007', '通報テスト', 'enjoy', now(), now() + interval '1 hour', 3);
\set RT '''10000000-0000-4000-8000-000000000016'''
-- 作成直後のアカウント3人 (テスト6・新規1・新規2) の通報では非表示にならない
select pg_temp.as_user('00000000-0000-4000-8000-000000000006');
select pg_temp.assert(public.submit_report('recruitment', :RT, '新規') = false, 'fresh reporter 1 not counted');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000021');
select pg_temp.assert(public.submit_report('recruitment', :RT, '新規') = false, 'fresh reporter 2 not counted');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000022');
select pg_temp.assert(public.submit_report('recruitment', :RT, '新規') = false, 'fresh reporter 3 not counted');
reset role;
select pg_temp.assert((select hidden_at is null from public.recruitments where id = :RT), '3 fresh reporters do not hide');
select pg_temp.assert((select count(*) from public.reports where target_id = :RT) = 3, 'fresh reports still recorded');
-- 作成から24時間以上のアカウントは数える (3人目で非表示)
select pg_temp.as_user(:U2);
select pg_temp.assert(public.submit_report('recruitment', :RT, '古い1') = false, 'old reporter 1');
reset role;
select pg_temp.as_user(:U4);
select pg_temp.assert(public.submit_report('recruitment', :RT, '古い2') = false, 'old reporter 2 (fresh ones still not counted)');
reset role;
select pg_temp.as_user(:U5);
select pg_temp.assert(public.submit_report('recruitment', :RT, '古い3') = true, 'third old reporter hides');
reset role;
-- 新規アカウントが後から24時間経っても、通報した時点の判定のまま (遡って数えない)
-- (作成3日前・その1時間後に通報した状態を再現する)
update public.profiles set created_at = now() - interval '3 days' where id = '00000000-0000-4000-8000-000000000021';
update public.reports set created_at = now() - interval '3 days' + interval '1 hour' where reporter_id = '00000000-0000-4000-8000-000000000021';
update public.recruitments set hidden_at = null where id = :RT;
delete from public.reports where target_id = :RT and reporter_id = :U5;
select pg_temp.as_user(:U2);
select pg_temp.assert(public.submit_report('recruitment', :RT, '古い1(再)') = false, 'aged-later account not counted retroactively');
reset role;

-- 17. v4: 匿名サインインのユーザー (auth.users.is_anonymous = true, provider = anonymous)
\set AN '''00000000-0000-4000-8000-000000000031'''
insert into auth.users (id, is_anonymous, raw_app_meta_data, created_at)
values (:AN, true, '{"provider":"anonymous","providers":["anonymous"]}', now());
select pg_temp.as_user(:AN);
-- v3 のトリガー (メールで直接作ったアカウントを拒否) に止められずにプロフィールを作れる
select public.save_my_profile('匿名さん', 's5', '{gunner}', '{}', '{}', 'listen', '{}', '', null, null, null, true, 'v4');
select pg_temp.assert((select rank_confirmed from public.profiles where id = :AN), 'anonymous profile rank confirmed');
-- 募集も作れる
select public.create_recruitment('匿名の募集', 'enjoy', now() + interval '5 minutes', now() + interval '65 minutes', 3, null, 'any', '{}', '', '5555', null, 'instant');
reset role;
\set RAN '(select id from public.recruitments where title = ''匿名の募集'')'
select pg_temp.assert((select count(*) from public.recruitments where owner_id = :AN) = 1, 'anonymous user created a recruitment');
-- 作成10分以内の匿名アカウントは、チャット10件まで (v4.1)
select pg_temp.as_user(:AN);
select public.send_message(:RAN, '1件目');
reset role;
update public.messages set created_at = now() - interval '1 minute' where user_id = :AN;
insert into public.messages (recruitment_id, user_id, body, created_at)
select :RAN, :AN, b || '件目', now() - interval '70 seconds' from generate_series(2, 10) b;
select pg_temp.as_user(:AN);
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), '4件目');
  raise exception 'ASSERT FAILED: new anonymous account limited to 3 messages';
exception when others then
  if sqlerrm not like '%10件まで%' then raise exception 'ASSERT FAILED: wrong error for anon chat limit: %', sqlerrm; end if;
end $t$;
reset role;
-- 匿名ではないアカウント (Discord・v3 のID登録) には効かない
select pg_temp.as_user(:U2);
select pg_temp.assert(public.request_join(:RAN, null) is not null, 'normal user joins anonymous recruitment');
reset role;
-- 引き継ぎコードでメールアドレスとパスワードを付ける (Supabase Auth が is_anonymous を false にし、provider は email になる)
update auth.users set is_anonymous = false, email = 't.abcd2345@example.edu',
  raw_app_meta_data = '{"provider":"email","providers":["anonymous","email"]}' where id = :AN;
update public.messages set created_at = now() - interval '1 minute' where user_id = :AN;
select pg_temp.as_user(:AN);
-- リンク後もプロフィールの更新 (v3 トリガーは insert のみ)・チャットができる
select public.save_my_profile('匿名さん改', 's5', '{gunner}', '{}', '{}', 'listen', '{}', '', null, null, null, false, 'v4');
select public.send_message(:RAN, 'リンク後');
select pg_temp.assert((select display_name from public.profiles where id = :AN) = '匿名さん改', 'linked user keeps and edits profile');
select pg_temp.assert(public.get_room_code(:RAN) = '5555', 'linked user still owns the recruitment');
reset role;

-- ---------------------------------------------------------------------
-- v6: 禁止語・20文字・連投・姿勢・いっしょに遊んだ人・通知を受け取る人
-- ---------------------------------------------------------------------
select pg_temp.assert(private.contains_banned('ライン交換しよ'), 'banned: katakana line exchange');
select pg_temp.assert(private.contains_banned('ＬＩＮＥ ｉｄ'), 'banned: fullwidth line id');
select pg_temp.assert(private.contains_banned('09012345678'), 'banned: phone number');
select pg_temp.assert(private.contains_banned('a.b@example.com'), 'banned: email');
select pg_temp.assert(private.contains_banned('何歳？'), 'banned: age');
select pg_temp.assert(not private.contains_banned('エンジョイでカスタムやろ'), 'not banned: enjoy custom');
select pg_temp.assert(not private.contains_banned('部屋番号12345です'), 'not banned: room number');
select pg_temp.assert(not private.contains_banned('オンラインですか'), 'not banned: online');
select pg_temp.as_user(:U2);
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), 'らいん交換しよ');
  raise exception 'ASSERT FAILED: banned chat accepted';
exception when others then
  if sqlerrm not like '%使えない言葉%' then raise exception 'ASSERT FAILED: wrong banned error: %', sqlerrm; end if;
end $t$;
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), repeat('あ', 51));
  raise exception 'ASSERT FAILED: 51 chars accepted';
exception when others then
  if sqlerrm not like '%50文字%' then raise exception 'ASSERT FAILED: wrong length error: %', sqlerrm; end if;
end $t$;
select public.send_message((select id from public.recruitments where title = '匿名の募集'), 'よろしく');
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), 'すぐ次');
  raise exception 'ASSERT FAILED: 3 second rule';
exception when others then
  if sqlerrm not like '%連続%' then raise exception 'ASSERT FAILED: wrong rate error: %', sqlerrm; end if;
end $t$;
reset role;
update public.messages set created_at = now() - interval '10 seconds' where user_id = :U2 and body = 'よろしく';
select pg_temp.as_user(:U2);
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), 'よろしく');
  raise exception 'ASSERT FAILED: duplicate accepted';
exception when others then
  if sqlerrm not like '%同じ内容%' then raise exception 'ASSERT FAILED: wrong dup error: %', sqlerrm; end if;
end $t$;
-- 募集の参加が確定したので、募集者 (AN) といっしょに遊んだ人になっている
select pg_temp.assert((select count(*) from public.play_mates where mate_id = :AN) = 1, 'play mate recorded for joiner');
select pg_temp.assert((select count(*) from public.play_mates where user_id <> :U2) = 0, 'only own play mates visible');
-- v14: いっしょに遊んだ人は自動では通知の対象にしない。ベルでオン・オフできる
select pg_temp.assert(not exists (select 1 from public.follows where follower_id = :U2 and followee_id = :AN), 'play mate not auto followed');
select public.set_follow(:AN, false);
select pg_temp.assert(not (select active from public.follows where follower_id = :U2 and followee_id = :AN), 'follow turned off');
select public.set_follow(:AN, true);
reset role;
select pg_temp.as_user(:AN);
select pg_temp.assert((select count(*) from public.play_mates where mate_id = :U2) = 1, 'play mate recorded for owner');
select pg_temp.assert((select count(*) from public.follows where follower_id <> :AN) = 0, 'cannot see others follows');
select public.create_recruitment('次の募集', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'win');
select pg_temp.expect_error($$select public.create_recruitment('姿勢なし', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'x')$$, 'bad stance rejected');
select pg_temp.expect_error($$select public.create_recruitment('ライン教えて', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'fun')$$, 'banned title rejected');
reset role;
select pg_temp.assert((select count(*) from public.notifications where user_id = :U2 and kind = 'followed_posted') = 1, 'follower notified');
select pg_temp.assert((select stance from public.recruitments where title = '次の募集') = 'win', 'stance saved');
-- 直接は書けない
select pg_temp.as_user(:U2);
select pg_temp.expect_error($$insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001')$$, 'no direct follow insert');
select pg_temp.expect_error($$select * from public.server_secrets$$, 'server secrets hidden');
select pg_temp.expect_error($$select * from public.push_subscriptions$$, 'push subscriptions hidden');
select public.save_push_subscription('https://push.example.com/abc', 'key', 'auth');
select pg_temp.assert(public.has_push_subscription(), 'push subscription saved');
reset role;

-- v7: チャレンジバトル
select pg_temp.as_user(:AN);
select pg_temp.expect_error($$select public.create_recruitment('チャレ4人', 'challenge', now() + interval '20 minutes', now() + interval '80 minutes', 4, null, 'any', '{}', '', null, null, 'instant', 'fun')$$, 'challenge max 3');
reset role;

-- v8: ランクがない人は募集・参加できない / ブロックしている人が参加したら通知
\set NR '''00000000-0000-4000-8000-000000000041'''
\set BL '''00000000-0000-4000-8000-000000000042'''
insert into auth.users (id) values (:NR), (:BL);
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (:NR, 'ランクなし', null, now(), 't'), (:BL, 'ブロック者', 's3', now(), 't');
select pg_temp.as_user(:NR);
select pg_temp.expect_error($$select public.create_recruitment('ランクなし募集', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'fun')$$, 'no rank cannot recruit');
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = '次の募集'), null)$$, 'no rank cannot join');
select public.confirm_my_rank('s2');
reset role;
-- ブロック者 (BL) が、匿名さん (AN) をブロック済みのときに AN の募集へ NR が入っても通知は来ない。BL がブロックした NR が、BL の参加中の募集に入ると通知
insert into public.blocks (blocker_id, blocked_id) values (:BL, :NR);
select pg_temp.as_user(:BL);
select public.request_join((select id from public.recruitments where title = '次の募集'), null);
reset role;
select pg_temp.as_user(:NR);
select public.request_join((select id from public.recruitments where title = '次の募集'), null);
reset role;
select pg_temp.assert((select count(*) from public.notifications where user_id = :BL and kind = 'blocked_joined') = 1, 'blocker notified when blocked user joins');
select pg_temp.as_user(:BL);
select pg_temp.assert((select count(*) from public.recruitments_with_blocked(array[(select id from public.recruitments where title = '次の募集')])) = 1, 'recruitment flagged for blocker');
reset role;

-- v9: 満員の通知 / 部屋番号は4桁 / メンテナンス中は管理者以外止める / お知らせ / BAN・削除 / 集計 / 最終利用
select pg_temp.assert((select count(*) from public.notifications n join public.recruitments r on r.id = n.recruitment_id
  where r.title = '次の募集' and n.kind = 'filled') = 3, 'owner and members notified when full');
select pg_temp.as_user(:AN);
select pg_temp.expect_error($$select public.set_room_code((select id from public.recruitments where title = '次の募集'), '12345')$$, 'room code must be 4 digits');
select pg_temp.expect_error($$select public.set_room_code((select id from public.recruitments where title = '次の募集'), 'abcd')$$, 'room code digits only');
select public.set_room_code((select id from public.recruitments where title = '次の募集'), '0123');
reset role;
update public.profiles set last_seen_at = now() - interval '30 days' where id = :AN;
select pg_temp.as_user(:AN);
update public.notifications set read_at = now() where user_id = :AN;
reset role;
select pg_temp.assert((select last_seen_at from public.profiles where id = :AN) > now() - interval '1 minute', 'activity updates last_seen_at');
select pg_temp.as_user(:U4);
select pg_temp.expect_error($$select public.admin_set_maintenance(true, null, null, 'x')$$, 'non-admin cannot set maintenance');
select pg_temp.expect_error($$select public.admin_announce('x')$$, 'non-admin cannot announce');
select pg_temp.expect_error($$select public.admin_delete_user('00000000-0000-4000-8000-000000000005')$$, 'non-admin cannot delete user');
select pg_temp.expect_error($$select public.admin_recruitment_stats(current_date - 30, current_date)$$, 'non-admin cannot read stats');
reset role;
select pg_temp.as_user(:ADM);
select public.admin_set_maintenance(true, null, null, '点検中');
reset role;
select pg_temp.as_user(null);
select pg_temp.assert((public.site_status() ->> 'active')::boolean, 'anon sees maintenance');
reset role;
select pg_temp.as_user(:U4);
select pg_temp.expect_error($$select public.create_recruitment('メンテ中', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'fun')$$, 'maintenance blocks users');
reset role;
select pg_temp.as_user(:ADM);
select public.admin_set_maintenance(false, now() + interval '1 day', now() + interval '1 day 2 hours', '予定');
select pg_temp.assert(not (public.site_status() ->> 'active')::boolean, 'scheduled maintenance not active yet');
select pg_temp.assert(public.admin_announce('メンテナンスのお知らせ') > 0, 'announce');
select pg_temp.expect_error($$select public.admin_delete_user('a785dedf-d035-424b-ae1c-16c9f61d37d1')$$, 'protected user cannot be deleted');
select pg_temp.expect_error($$select public.admin_set_user_state('a785dedf-d035-424b-ae1c-16c9f61d37d1', 'ban')$$, 'protected user cannot be banned');
select pg_temp.assert((public.admin_recruitment_stats(current_date - 30, current_date + 7) ->> 'total')::int > 0, 'stats');
select public.admin_delete_user(:U5);
reset role;
select pg_temp.assert((select count(*) from public.notifications where kind = 'announcement' and user_id = :U4) = 1, 'announcement delivered');
select pg_temp.assert(not exists (select 1 from public.profiles where id = :U5), 'admin deleted user');

-- v10: ランクは A以下にまとめる / チャットで ID や分けて送った電話番号を弾く / 通報の詳細
select pg_temp.assert((select count(*) from public.profiles where rank_band in ('f', 'e', 'd', 'c', 'b')) = 0, 'low ranks merged into a');
select pg_temp.expect_error($$update public.profiles set rank_band = 'b' where id = '00000000-0000-4000-8000-000000000004'$$, 'rank b rejected');
select pg_temp.assert(private.contains_contact('abc123'), 'id-like blocked');
select pg_temp.assert(private.contains_contact('@taro_9'), 'handle blocked');
select pg_temp.assert(not private.contains_contact('3on3やろ'), '3on3 ok');
select pg_temp.assert(private.contains_banned('〇九〇一二三四五六七八'), 'kanji phone blocked');
select pg_temp.assert(not private.contains_banned('かえろうか'), 'kaerou ok');
update public.messages set created_at = now() - interval '1 hour' where user_id = :U2;
select pg_temp.as_user(:U2);
select public.send_message((select id from public.recruitments where title = '匿名の募集'), '0901');
reset role;
update public.messages set created_at = created_at - interval '5 seconds' where user_id = :U2 and body = '0901';
select pg_temp.as_user(:U2);
select public.send_message((select id from public.recruitments where title = '匿名の募集'), '2345');
reset role;
update public.messages set created_at = created_at - interval '5 seconds' where user_id = :U2 and body = '2345';
select pg_temp.as_user(:U2);
select pg_temp.expect_error($$select public.send_message((select id from public.recruitments where title = '匿名の募集'), '678')$$, 'split phone number blocked');
select pg_temp.expect_error($$select public.send_message((select id from public.recruitments where title = '匿名の募集'), 'id abc123')$$, 'id in chat blocked');
reset role;

-- v11: ランク条件より下の方は参加できない / アイコン / Discord
\set LR '''00000000-0000-4000-8000-000000000051'''
insert into auth.users (id) values (:LR);
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (:LR, 'A以下さん', 'a', now(), 't');
update public.profiles set rank_band = 's6' where id = :U4;
select pg_temp.as_user(:U4);
select public.create_recruitment('S5以上', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, 's5', 'any', '{}', '', null, null, 'instant', 'win');
reset role;
select pg_temp.as_user(:LR);
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'S5以上'), null)$$, 'rank a cannot join s5 recruitment');
select public.set_my_avatar('cat');
select pg_temp.expect_error($$select public.set_my_avatar('dog')$$, 'unknown avatar rejected');
select public.set_my_discord('@Compass_Taro');
select pg_temp.expect_error($$select public.set_my_discord('ab cd')$$, 'bad discord rejected');
reset role;
select pg_temp.assert((select avatar from public.profiles where id = :LR) = 'cat', 'avatar saved');
select pg_temp.assert((select contact_discord from public.profile_contacts where user_id = :LR) = 'compass_taro', 'discord saved');
update public.profiles set rank_band = 's5' where id = :LR;
select pg_temp.as_user(:LR);
select public.request_join((select id from public.recruitments where title = 'S5以上'), null);
reset role;

-- v12: 管理者のユーザー一覧
select pg_temp.as_user(:U4);
select pg_temp.expect_error($$select public.admin_list_users('', 1)$$, 'non-admin cannot list users');
reset role;
select pg_temp.as_user(:ADM);
select pg_temp.assert((public.admin_list_users('', 1) ->> 'total')::int > 10, 'admin lists users');
select pg_temp.assert(jsonb_array_length(public.admin_list_users('', 1) -> 'rows') = 10, 'page size 10');
reset role;

-- v13: 通報した発言が消えても、管理画面に中身と送り主が残る
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '通報される発言');
reset role;
select pg_temp.as_user(:U4);
select public.submit_report('message', (select id from public.messages where body = '通報される発言'), '暴言');
reset role;
select pg_temp.assert((select target_owner_id from public.reports where reason = '暴言') = :LR, 'report keeps owner');
delete from public.messages where body = '通報される発言';
select pg_temp.as_user(:ADM);
select pg_temp.assert((select target_owner from public.admin_report_summary() where '暴言' = any(reasons)) = :LR, 'admin sees owner of deleted message');
select pg_temp.assert((select target_label from public.admin_report_summary() where '暴言' = any(reasons)) = '通報される発言', 'admin sees body of deleted message');
select pg_temp.assert((select owner_name from public.admin_report_summary() where '暴言' = any(reasons)) = 'A以下さん', 'admin sees owner name');
reset role;

-- v14: 部屋番号の送り直しは弾かない / メンバーも部屋番号を変えられ、ほかのメンバーに通知 / 延長 / チャットの通知を止める / お気に入り通知の抑制
select pg_temp.assert(not exists (select 1 from public.follows where follower_id = :LR and followee_id = :U4), 'v14: joiner not auto followed');
update public.messages set created_at = now() - interval '1 hour' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '1234');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '5678');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '9012');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), 'ok');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '4321');
reset role;
-- 分けて送った電話番号は今までどおり弾く (0901 / 2345 / 678)
update public.messages set created_at = now() - interval '1 hour' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '0901');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '2345');
reset role;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select pg_temp.expect_error($$select public.send_message((select id from public.recruitments where title = 'S5以上'), '678')$$, 'v14: split phone number still blocked');
reset role;
update public.messages set created_at = now() - interval '1 hour' where user_id = :LR;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), repeat('あ', 50));
reset role;
-- 部屋番号: メンバー (LR) も変えられる。メンバーでない方は変えられない
delete from public.notifications where user_id = :U4;
select pg_temp.as_user(:LR);
select public.set_room_code((select id from public.recruitments where title = 'S5以上'), '1111');
select pg_temp.assert(public.get_room_info((select id from public.recruitments where title = 'S5以上')) ->> 'updated_by' = :LR, 'v14: room info has updater');
select public.set_room_code((select id from public.recruitments where title = 'S5以上'), '2222');
select pg_temp.expect_error($$select public.extend_recruitment((select id from public.recruitments where title = 'S5以上'), 60)$$, 'v14: member cannot extend');
reset role;
-- v15: 部屋番号が変わっても通知しない
select pg_temp.assert((select count(*) from public.notifications where kind = 'room_code') = 0, 'v15: no room code notification');
select pg_temp.as_user(:U2);
select pg_temp.expect_error($$select public.set_room_code((select id from public.recruitments where title = 'S5以上'), '3333')$$, 'v14: non-member cannot set room code');
select pg_temp.assert(public.get_room_info((select id from public.recruitments where title = 'S5以上')) is null, 'v14: non-member gets no room info');
reset role;
-- 延長
select pg_temp.as_user(:U4);
select pg_temp.expect_error($$select public.extend_recruitment((select id from public.recruitments where title = 'S5以上'), 90)$$, 'v14: only 30 or 60');
select public.extend_recruitment((select id from public.recruitments where title = 'S5以上'), 60);
reset role;
select pg_temp.assert((select ends_at - starts_at from public.recruitments where title = 'S5以上') = interval '2 hours', 'v14: extended by 1 hour');
-- チャットの通知を止めると、新着メッセージの通知はプッシュの対象にならない
select pg_temp.as_user(:U4);
select public.set_chat_mute((select id from public.recruitments where title = 'S5以上'), true);
reset role;
delete from public.notifications where user_id = :U4;
update public.messages set created_at = created_at - interval '10 seconds' where user_id = :LR;
select pg_temp.as_user(:LR);
select public.send_message((select id from public.recruitments where title = 'S5以上'), '止めた部屋');
reset role;
select pg_temp.assert((select pushed_at is not null from public.notifications where user_id = :U4 and kind = 'new_message'), 'v14: muted chat not pushed');
select pg_temp.as_user(:U4);
select pg_temp.assert((select count(*) from public.chat_mutes) = 1, 'v14: own mute visible');
select public.set_chat_mute((select id from public.recruitments where title = 'S5以上'), false);
select pg_temp.assert((select count(*) from public.chat_mutes) = 0, 'v14: mute removed');
reset role;
-- お気に入りの募集通知: 同じ方の募集は3時間に1回まで
select pg_temp.as_user(:LR);
select public.set_follow(:U4, true);
reset role;
select pg_temp.as_user(:U4);
select public.create_recruitment('お気に入り1', 'enjoy', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'fun');
select public.create_recruitment('お気に入り2', 'enjoy', now() + interval '30 minutes', now() + interval '90 minutes', 3, null, 'any', '{}', '', null, null, 'instant', 'fun');
reset role;
select pg_temp.assert((select count(*) from public.notifications where user_id = :LR and kind = 'followed_posted') = 1, 'v14: same followee notified once per 3 hours');

-- v15: 2固定・ほしいロール・デキレ/コラボ数 (バトルアリーナの承認制)・予定時刻の知らせ・始まらない募集を閉じる
\set DK '''00000000-0000-4000-8000-000000000061'''
\set DJ '''00000000-0000-4000-8000-000000000062'''
insert into auth.users (id) values (:DK), (:DJ);
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (:DK, 'デキレ主', 's5', now(), 't'), (:DJ, 'デキレ参加', 's5', now(), 't');
select pg_temp.as_user(:DK);
select pg_temp.expect_error($$select public.create_recruitment('デキレなし', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'approval', 'win')$$, 'v15: owner deck level required');
select public.create_recruitment('デキレ募集', 'rank', now() + interval '20 minutes', now() + interval '80 minutes', 3, null, 'any', '{}', '', null, null, 'approval', 'win', true, array['tank'], 230, 40, 200, 30);
select public.create_recruitment('今すぐ募集', 'enjoy', now(), now() + interval '2 hours', 3, null, 'any', '{}', '', null, null, 'instant', 'fun', true, '{}', 230, 40, 200, 30);
reset role;
select pg_temp.assert((select duo_ok and wanted_roles = array['tank'] and owner_deck_level = 230 and min_collab = 30 from public.recruitments where title = 'デキレ募集'), 'v15: recruitment fields saved');
select pg_temp.assert((select owner_deck_level is null and duo_ok from public.recruitments where title = '今すぐ募集'), 'v15: deck fields only for rank approval');
select pg_temp.assert((select start_notified_at is not null from public.recruitments where title = '今すぐ募集'), 'v15: now recruitment gets no start notice');
select pg_temp.as_user(:DJ);
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'デキレ募集'), null)$$, 'v15: deck level required to apply');
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'デキレ募集'), null, 190, 50)$$, 'v15: below min deck level');
select pg_temp.expect_error($$select public.request_join((select id from public.recruitments where title = 'デキレ募集'), null, 205, 50)$$, 'v15: deck level step 10');
select public.request_join((select id from public.recruitments where title = 'デキレ募集'), null, 210, 30);
select public.request_join((select id from public.recruitments where title = '今すぐ募集'), null);
reset role;
select pg_temp.assert((select deck_level = 210 and collab = 30 from public.participations where user_id = :DJ and status = 'pending'), 'v15: applicant deck saved');
-- 予定時刻の知らせ: デキレ募集の開始を過去にして定期処理
delete from public.notifications where user_id in (:DK, :DJ);
update public.recruitments set starts_at = now() - interval '1 minute' where title = 'デキレ募集';
select private.tick();
select pg_temp.assert((select count(*) from public.notifications n join public.recruitments r on r.id = n.recruitment_id where r.title = 'デキレ募集' and n.kind = 'starting') = 1, 'v15: owner gets start notice (pending applicant does not)');
select private.tick();
select pg_temp.assert((select count(*) from public.notifications where kind = 'starting' and user_id = :DK) = 1, 'v15: start notice only once');
-- 60分たってもそろわない募集は閉じる。2固定でも可で1人いる募集は閉じない
update public.recruitments set starts_at = now() - interval '61 minutes', created_at = now() - interval '2 hours' where title in ('デキレ募集', '今すぐ募集');
select private.tick();
select pg_temp.assert((select status from public.recruitments where title = 'デキレ募集') = 'ended', 'v15: unstarted recruitment closed');
select pg_temp.assert((select count(*) from public.notifications n join public.recruitments r on r.id = n.recruitment_id where r.title = 'デキレ募集' and n.kind = 'auto_closed') = 1, 'v15: owner notified of auto close');
select pg_temp.assert((select status from public.recruitments where title = '今すぐ募集') = 'open', 'v15: duo recruitment with a member stays open');

select 'ALL RLS TESTS PASSED' as result;

