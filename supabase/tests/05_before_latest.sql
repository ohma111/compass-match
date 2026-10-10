-- 最新のマイグレーションを流す前の状態を作る (db-verify.sh から実行)。
-- v14 (migration 18): 行き先のない play_mates_counted の行と、プッシュサーバー以外の登録先は、マイグレーションで消える。
-- 18 がすでに流れている (外部キー・制約がある) ときは入れられないので、そのときは入れない。
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'play_mates_counted_recruitment_fkey') then
    insert into private.play_mates_counted values
      ('20000000-0000-4000-8000-0000000000aa', '20000000-0000-4000-8000-0000000000bb', '20000000-0000-4000-8000-0000000000cc');
  end if;
  insert into auth.users (id) values ('20000000-0000-4000-8000-0000000000dd');
  insert into public.profiles (id, display_name, rank_band, terms_agreed_at, terms_version)
    values ('20000000-0000-4000-8000-0000000000dd', '登録先テスト', 's1', now(), 't');
  if not exists (select 1 from pg_proc where proname = 'is_push_endpoint') then
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values ('20000000-0000-4000-8000-0000000000dd', 'https://evil.example.com/x', 'k', 'a');
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('20000000-0000-4000-8000-0000000000dd', 'https://fcm.googleapis.com/fcm/send/ok', 'k', 'a');
end $$;
