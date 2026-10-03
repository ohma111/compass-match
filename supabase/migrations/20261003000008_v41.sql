-- =====================================================================
-- v4.1: ランク帯を4段階に (F〜A / S1〜S4 / S5〜S7 / S8以上)、
--       作成10分以内の匿名アカウントのチャット上限を 3 → 10 件に。
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。シードなし。
--
-- 旧コード → 新コード: fc,ba → fa / s1_3 → s1_4 / s4_6 → s5_7 / s7_9 → s5_7 / s10p → s8p
-- 古い制約を外す → データを移す → 新しい制約を付ける、の順。全体を1トランザクションで行う。
-- =====================================================================
begin;

alter table public.profiles drop constraint if exists profiles_rank_band_chk;
alter table public.recruitments drop constraint if exists recruitments_min_rank_chk;

update public.profiles set rank_band = case rank_band
    when 'fc' then 'fa' when 'ba' then 'fa'
    when 's1_3' then 's1_4'
    when 's4_6' then 's5_7' when 's7_9' then 's5_7'
    when 's10p' then 's8p'
  end
  where rank_band in ('fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p');

update public.recruitments set min_rank = case min_rank
    when 'fc' then 'fa' when 'ba' then 'fa'
    when 's1_3' then 's1_4'
    when 's4_6' then 's5_7' when 's7_9' then 's5_7'
    when 's10p' then 's8p'
  end
  where min_rank in ('fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p');

alter table public.profiles add constraint profiles_rank_band_chk
  check (rank_band in ('fa', 's1_4', 's5_7', 's8p'));
alter table public.recruitments add constraint recruitments_min_rank_chk
  check (min_rank is null or min_rank in ('fa', 's1_4', 's5_7', 's8p'));

-- v3 の confirm_my_rank: 許可するランク帯を新しい4つに (引数・戻り値は同じなので権限は引き継がれる)
create or replace function public.confirm_my_rank(p_rank_band text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if p_rank_band is null or p_rank_band not in ('fa', 's1_4', 's5_7', 's8p') then
    raise exception 'ランク帯を選んでください' using errcode = '22023';
  end if;
  update public.profiles set rank_band = p_rank_band, rank_confirmed = true where id = v_uid;
  if not found then
    raise exception '先に登録を完了してください' using errcode = 'P0002';
  end if;
end;
$$;

-- v4 のチャット上限: 作成10分以内の匿名アカウントは10件まで
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
          where m.user_id = new.user_id and m.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'はじめて10分は10件までです。ちょっと待ってから送ってください'
      using errcode = 'P0429';
  end if;
  return new;
end;
$$;

commit;
