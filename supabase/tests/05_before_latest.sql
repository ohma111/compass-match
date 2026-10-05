-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v8: これまでに遊んだ人が通知の対象になること、保存期間が短くなることを確かめる。
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-0000000000d1', '遊び1', 's5', now(), 't'),
  ('00000000-0000-4000-8000-0000000000d2', '遊び2', 's6', now(), 't');
insert into public.play_mates (user_id, mate_id) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1');
alter table public.recruitments disable trigger user;
insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity, status) values
  ('30000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '保存20日前', 'rank', now() - interval '20 days 1 hour', now() - interval '20 days', 3, 'ended'),
  ('30000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1', '保存2時間前', 'rank', now() - interval '3 hours', now() - interval '2 hours', 3, 'ended');
alter table public.recruitments enable trigger user;
alter table public.messages disable trigger user;
insert into public.messages (recruitment_id, user_id, body) values
  ('30000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1', '古い発言');
alter table public.messages enable trigger user;
