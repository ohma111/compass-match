-- =====================================================================
-- v4: 登録なし (Supabase の匿名サインイン) で遊べるようにする
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。シードなし。
--
-- 匿名ユーザーは auth.users の普通の行 (is_anonymous = true、ロールは authenticated) なので、
-- RLS・チャット・通報・ブロック・レート制限はそのまま効く。このファイルで足すのは1つだけ:
--   作成から10分以内の匿名アカウントは、チャットを3件までしか送れない (荒らし対策)。
--
-- v3 のトリガー private.require_account_for_email_users は、プロフィールの insert 時に
-- provider = 'email' かつ accounts 行なしのときだけ拒否する。匿名ユーザーの provider は
-- 'anonymous' なので通る。あとで引き継ぎコード用のメールアドレスを付けても、それは
-- プロフィール作成後 (update のみ) なので影響しない。db:verify で確認している。
-- =====================================================================

create or replace function private.limit_new_anonymous_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_anon boolean;
begin
  select coalesce(u.is_anonymous, false) and u.created_at > now() - interval '10 minutes'
    into v_new_anon
    from auth.users u
    where u.id = new.user_id;
  if coalesce(v_new_anon, false)
     and (select count(*) from public.messages m
          where m.user_id = new.user_id and m.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'はじめたばかりの最初の10分は、メッセージを3件までしか送れません。少し待ってから送ってください'
      using errcode = 'P0429';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_limit_new_anonymous on public.messages;
create trigger messages_limit_new_anonymous before insert on public.messages
  for each row execute function private.limit_new_anonymous_chat();
