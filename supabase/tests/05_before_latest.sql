-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v9: 運営者のアカウントが消えないこと、消した募集が集計に残ることを確かめる。
insert into auth.users (id, is_anonymous) values
  ('a785dedf-d035-424b-ae1c-16c9f61d37d1', false),
  ('00000000-0000-4000-8000-0000000000d1', false);
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version, last_seen_at) values
  ('a785dedf-d035-424b-ae1c-16c9f61d37d1', '運営', 's5', now(), 't', now() - interval '400 days'),
  ('00000000-0000-4000-8000-0000000000d1', '放置', 's6', now(), 't', now() - interval '400 days');
alter table public.recruitments disable trigger user;
insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity, status, filled_at) values
  ('30000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '集計20日前', 'rank', now() - interval '20 days 1 hour', now() - interval '20 days', 3, 'ended', now() - interval '20 days 30 minutes');
alter table public.recruitments enable trigger user;
