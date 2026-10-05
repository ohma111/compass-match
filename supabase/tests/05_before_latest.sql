-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v10: A以下の細かいランクが a にまとまること、ランク条件の A 以下が「指定なし」になることを確かめる。
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version) values
  ('00000000-0000-4000-8000-0000000000e1', 'Cランク', 'c', now(), 't');
alter table public.recruitments disable trigger user;
insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity, status, min_rank) values
  ('30000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1', 'B以上', 'rank', now() + interval '1 hour', now() + interval '2 hours', 3, 'open', 'b');
alter table public.recruitments enable trigger user;
