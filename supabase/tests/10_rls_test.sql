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
select public.create_recruitment('ランク S4〜 あと2人', 'rank', now() + interval '10 minutes', now() + interval '70 minutes', 3, 's4_6', 'on', '{serious}', '', '777', 'x');
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
select pg_temp.assert(public.get_room_code(:RI) = '777', 'instant member sees room code');
select public.request_join(:RI, null);
reset role;
select pg_temp.assert((select approved_count from public.recruitments where id = :RI) = 1, 'instant count 1 (idempotent)');
select pg_temp.assert((select count(*) from public.notifications where user_id = :U5 and recruitment_id = :RI and kind = 'joined') = 1, 'owner notified joined');
select pg_temp.assert((select decided_at is not null from public.participations where recruitment_id = :RI and user_id = :U2), 'instant decided_at set');

insert into auth.users (id) values ('00000000-0000-4000-8000-000000000007');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version)
  values ('00000000-0000-4000-8000-000000000007', 'テスト7', 's4_6', now(), 't');
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
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values (:P1, 'プレイヤー1', 's1_3', now(), 't');
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
select pg_temp.expect_error($$select public.save_my_profile('直接', 'fc', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3')$$, 'email user without account cannot create profile');
reset role;
set role service_role;
select public.register_account('00000000-0000-4000-8000-000000000013', 'player_three', repeat('4', 64));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000013');
select public.save_my_profile('ID登録', 'fc', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000014');
select public.save_my_profile('Discord', 'fc', '{}', '{}', '{}', 'no', '{}', '', null, null, null, true, 'v3');
reset role;
select pg_temp.assert((select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000014')) = 2, 'id-registered and discord users can create profiles');
select pg_temp.assert((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000012') = 0, 'no profile for raw email signup');
-- ユーザーIDで登録した人はランク帯が未確定で始まり、confirm_my_rank で確定する。Discord の人は確定済み
select pg_temp.assert((select rank_confirmed from public.profiles where id = '00000000-0000-4000-8000-000000000013') = false, 'id signup starts with unconfirmed rank');
select pg_temp.assert((select rank_confirmed from public.profiles where id = '00000000-0000-4000-8000-000000000014') = true, 'discord signup rank confirmed');
select pg_temp.as_user('00000000-0000-4000-8000-000000000013');
select pg_temp.expect_error($$select public.confirm_my_rank('zz')$$, 'invalid rank rejected');
select public.confirm_my_rank('s7_9');
select pg_temp.assert((select rank_confirmed and rank_band = 's7_9' from public.profiles where id = '00000000-0000-4000-8000-000000000013'), 'rank confirmed');
reset role;
select pg_temp.as_user(null);
select pg_temp.expect_error($$select public.confirm_my_rank('fc')$$, 'anon cannot confirm rank');
reset role;

-- 16. v3: 通報時点で作成24時間未満のアカウントの通報は自動非表示の人数に数えない
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000021'), ('00000000-0000-4000-8000-000000000022');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-000000000021', '新規1', 'fc', now(), 't'),
  ('00000000-0000-4000-8000-000000000022', '新規2', 'fc', now(), 't');
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
select public.save_my_profile('匿名さん', 's4_6', '{gunner}', '{}', '{}', 'listen', '{}', '', null, null, null, true, 'v4');
select pg_temp.assert((select rank_confirmed from public.profiles where id = :AN), 'anonymous profile rank confirmed');
-- 募集も作れる
select public.create_recruitment('匿名の募集', 'enjoy', now() + interval '5 minutes', now() + interval '65 minutes', 3, null, 'any', '{}', '', '555', null, 'instant');
reset role;
\set RAN '(select id from public.recruitments where title = ''匿名の募集'')'
select pg_temp.assert((select count(*) from public.recruitments where owner_id = :AN) = 1, 'anonymous user created a recruitment');
-- 作成10分以内の匿名アカウントは、チャット3件まで
select pg_temp.as_user(:AN);
select public.send_message(:RAN, '1件目');
reset role;
update public.messages set created_at = now() - interval '1 minute' where user_id = :AN;
insert into public.messages (recruitment_id, user_id, body, created_at)
select :RAN, :AN, b, now() - interval '30 seconds' from unnest(array['2件目', '3件目']) b;
select pg_temp.as_user(:AN);
do $t$ begin
  perform public.send_message((select id from public.recruitments where title = '匿名の募集'), '4件目');
  raise exception 'ASSERT FAILED: new anonymous account limited to 3 messages';
exception when others then
  if sqlerrm not like '%最初の10分%' then raise exception 'ASSERT FAILED: wrong error for anon chat limit: %', sqlerrm; end if;
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
select public.save_my_profile('匿名さん改', 's4_6', '{gunner}', '{}', '{}', 'listen', '{}', '', null, null, null, false, 'v4');
select public.send_message(:RAN, 'リンク後');
select pg_temp.assert((select display_name from public.profiles where id = :AN) = '匿名さん改', 'linked user keeps and edits profile');
select pg_temp.assert(public.get_room_code(:RAN) = '555', 'linked user still owns the recruitment');
reset role;

select 'ALL RLS TESTS PASSED' as result;

