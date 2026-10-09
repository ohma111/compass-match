-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v14: 行き先のない play_mates_counted の行と、プッシュサーバー以外の登録先は、マイグレーションで消える
insert into private.play_mates_counted values
  ('20000000-0000-4000-8000-0000000000aa', '20000000-0000-4000-8000-0000000000bb', '20000000-0000-4000-8000-0000000000cc');
insert into auth.users (id) values ('20000000-0000-4000-8000-0000000000dd');
insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version)
  values ('20000000-0000-4000-8000-0000000000dd', '登録先テスト', 's1', now(), 't');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('20000000-0000-4000-8000-0000000000dd', 'https://evil.example.com/x', 'k', 'a'),
         ('20000000-0000-4000-8000-0000000000dd', 'https://fcm.googleapis.com/fcm/send/ok', 'k', 'a');
