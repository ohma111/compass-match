-- =====================================================================
-- 開発用シードデータ (ローカル `supabase db reset` 時のみ投入される)
-- 本番には投入しないこと。ダミーユーザーはログインできない。
-- =====================================================================

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed1@example.invalid', now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed2@example.invalid', now(), now()),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed3@example.invalid', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name, rank_band, play_roles, characters, purposes, vc, tags, bio, terms_agreed_at, terms_version)
values
  ('00000000-0000-4000-8000-000000000001', 'サンプル募集者', 's5_7', '{attacker}', '{ジャスティス}', '{enjoy,rank}', 'yes', '{beginner_welcome,relaxed}', '夜にまったり遊んでいます。', now(), '2026-09-30'),
  ('00000000-0000-4000-8000-000000000002', 'サンプル参加者', 's1_4', '{tank}', '{}', '{enjoy}', 'listen', '{relaxed}', 'はじめたばかりです。', now(), '2026-09-30'),
  ('00000000-0000-4000-8000-000000000003', 'サンプルガチ勢', 's8p', '{gunner,sprinter}', '{}', '{tournament}', 'yes', '{serious,practice}', '', now(), '2026-09-30')
on conflict (id) do nothing;

insert into public.profile_contacts (user_id, contact_discord, contact_x, contact_ingame)
values
  ('00000000-0000-4000-8000-000000000001', 'seed_owner', 'seed_owner', null),
  ('00000000-0000-4000-8000-000000000002', null, null, 'サンプルID')
on conflict (user_id) do nothing;

insert into public.recruitments (id, owner_id, title, purpose, starts_at, ends_at, capacity, vc, tags, note, src, join_mode)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '21時からまったりバトアリ', 'enjoy',
   date_trunc('hour', now()) + interval '2 hours', date_trunc('hour', now()) + interval '4 hours',
   3, 'any', '{beginner_welcome,relaxed}', '初心者さん歓迎です', 'guild', 'approval'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
   '大会練習 カスタム', 'tournament',
   date_trunc('hour', now()) + interval '1 day', date_trunc('hour', now()) + interval '1 day 2 hours',
   3, 'on', '{serious,practice}', '', 'x', 'instant')
on conflict (id) do nothing;

insert into public.recruitment_secrets (recruitment_id, room_code)
values ('10000000-0000-4000-8000-000000000001', '12345')
on conflict (recruitment_id) do nothing;
