-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v5: 定期メンテナンスで消えるもの・残るものを入れておく。
insert into auth.users (id, is_anonymous, created_at) values
  ('00000000-0000-4000-8000-0000000000b1', false, now() - interval '200 days'),  -- 募集者 (残る)
  ('00000000-0000-4000-8000-0000000000b2', true,  now() - interval '5 days'),    -- プロフィールなしの匿名・5日 (消える)
  ('00000000-0000-4000-8000-0000000000b3', true,  now() - interval '1 day'),     -- プロフィールなしの匿名・1日 (残る)
  ('00000000-0000-4000-8000-0000000000b4', true,  now() - interval '30 days');   -- プロフィールありの匿名 (残る)
insert into public.profiles (id, display_name, rank_band, play_roles, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-0000000000b1', '片付け主', 's5_7', '{tank}', now(), 't'),
  ('00000000-0000-4000-8000-0000000000b4', '片付け匿名', 's1_4', '{}', now(), 't');
alter table public.recruitments disable trigger user;
insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity, status) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', '片付け古い', 'rank', now() - interval '90 days 2 hours', now() - interval '90 days', 3, 'ended'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', '片付け通報あり', 'rank', now() - interval '90 days 2 hours', now() - interval '90 days', 3, 'ended'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b1', '片付け最近', 'rank', now() - interval '10 days 2 hours', now() - interval '10 days', 3, 'ended');
alter table public.recruitments enable trigger user;
insert into public.reports (reporter_id, target_type, target_id, reason) values
  ('00000000-0000-4000-8000-0000000000b4', 'recruitment', '30000000-0000-4000-8000-000000000002', 'テスト');
insert into public.notifications (user_id, kind, recruitment_id, created_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'approved', '30000000-0000-4000-8000-000000000003', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000000b1', 'approved', '30000000-0000-4000-8000-000000000003', now() - interval '2 days');
