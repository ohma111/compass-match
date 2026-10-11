-- =====================================================================
-- v17: 部屋 (募集) の時間
--   1) 募集は開始から90分で必ず閉じる (利用者は時間を選べない・延長もしない)
--   2) チャットは送ってから90分で消える (部屋が開いている間も)
--   3) 募集者が「固定を解散する」で部屋を閉じる (dissolve_recruitment)
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。
-- =====================================================================

-- 1) 終了は開始から90分まで (延長・2固定中の自動延長もここで止まる)
create or replace function private.clamp_room_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at > new.starts_at + interval '90 minutes' then
    new.ends_at := new.starts_at + interval '90 minutes';
  end if;
  return new;
end;
$$;
drop trigger if exists recruitments_clamp_end on public.recruitments;
create trigger recruitments_clamp_end before insert or update of ends_at, starts_at on public.recruitments
  for each row execute function private.clamp_room_end();

-- 2) 90分より前の発言を消す (毎分)
create or replace function private.purge_old_messages()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.messages where created_at < now() - interval '90 minutes';
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('compass-chat-purge') where exists (select 1 from cron.job where jobname = 'compass-chat-purge');
    perform cron.schedule('compass-chat-purge', '* * * * *', 'select private.purge_old_messages()');
  end if;
end $$;

-- 3) 固定を解散する
create or replace function public.dissolve_recruitment(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.recruitments;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ解散できます' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) in ('ended', 'cancelled') then
    raise exception 'この募集はすでに終了しています' using errcode = '22023';
  end if;
  update public.recruitments set status = 'ended', ends_at = greatest(now(), starts_at + interval '1 second') where id = r.id;
end;
$$;
revoke execute on function public.dissolve_recruitment(uuid) from public, anon;
grant execute on function public.dissolve_recruitment(uuid) to authenticated;
