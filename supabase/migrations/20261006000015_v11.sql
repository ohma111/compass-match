-- v11 (2026-10-06 昼): 運営者の要望。2回流しても壊れない。
--  1) 募集のランク条件より下のランクの方は参加できない (参加・申請のときに DB で止める)
--  2) プロフィールのアイコンを選べる (profiles.avatar。null はこれまでどおりロールか模様)
--  3) VC ありの募集のために、Discord のユーザー名だけを保存する RPC

-- 1) ---------------------------------------------------------------------
create or replace function private.rank_value(p text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p = 'a' then 0 when p ~ '^s[1-9]$' then substr(p, 2)::int else null end;
$$;

create or replace function private.check_rank_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min text;
  v_rank text;
begin
  if tg_op = 'INSERT' or (new.status in ('pending', 'approved') and old.status not in ('pending', 'approved')) then
    perform private.require_rank(new.user_id);
    -- 申請中の人を募集者が承認するときは、申請のときに確かめているので見ない
    if tg_op = 'INSERT' or old.status not in ('pending') then
      select min_rank into v_min from public.recruitments where id = new.recruitment_id;
      if v_min is not null then
        select rank_band into v_rank from public.profiles where id = new.user_id;
        if coalesce(private.rank_value(v_rank), -1) < private.rank_value(v_min) then
          raise exception 'ランク条件を満たしていないため、参加できません' using errcode = '22023';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 2) ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_chk;
alter table public.profiles add constraint profiles_avatar_chk
  check (avatar is null or avatar in ('cat', 'rabbit', 'bear', 'ghost', 'star'));
grant select (avatar) on public.profiles to anon;
grant select (avatar) on public.profiles to authenticated;

create or replace function public.set_my_avatar(p_avatar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_avatar is not null and p_avatar not in ('cat', 'rabbit', 'bear', 'ghost', 'star') then
    raise exception 'アイコンを選び直してください' using errcode = '22023';
  end if;
  update public.profiles set avatar = p_avatar where id = v_uid;
end;
$$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- 3) ---------------------------------------------------------------------
create or replace function public.set_my_discord(p_discord text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v text := lower(regexp_replace(btrim(coalesce(p_discord, '')), '^@', ''));
begin
  if v !~ '^[a-z0-9_.]{2,32}$' then
    raise exception 'Discordのユーザー名は、半角英小文字・数字・_ . の2〜32文字で入力してください' using errcode = '22023';
  end if;
  insert into public.profile_contacts (user_id, contact_discord) values (v_uid, v)
  on conflict (user_id) do update set contact_discord = excluded.contact_discord;
end;
$$;
revoke execute on function public.set_my_discord(text) from public, anon;
grant execute on function public.set_my_discord(text) to authenticated;
