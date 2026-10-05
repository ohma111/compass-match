-- v7 (2026-10-05): ランクを帯 (4段階) から1つずつ (F E D C B A S1〜S9) に。目的に「チャレンジバトル」を追加。2回流しても壊れない。
--  - 今の帯は、帯の一番下のランクに仮に置き換え、rank_confirmed = false にして次に開いたとき選び直してもらう
--    (fa → a は「A以下」の一番上。A以下の人は大半がAのため)
--  - 募集のランク条件は下限なので、帯の一番下に置き換える (fa → f = 条件なしと同じ)

alter table public.profiles drop constraint if exists profiles_rank_band_chk;
alter table public.recruitments drop constraint if exists recruitments_min_rank_chk;

update public.profiles set rank_band = case rank_band
    when 'fa' then 'a'
    when 's1_4' then 's1'
    when 's5_7' then 's5'
    when 's8p' then 's8'
  end,
  rank_confirmed = false
  where rank_band in ('fa', 's1_4', 's5_7', 's8p');

update public.recruitments set min_rank = case min_rank
    when 'fa' then null
    when 's1_4' then 's1'
    when 's5_7' then 's5'
    when 's8p' then 's8'
  end
  where min_rank in ('fa', 's1_4', 's5_7', 's8p');

alter table public.profiles add constraint profiles_rank_band_chk
  check (rank_band in ('f', 'e', 'd', 'c', 'b', 'a', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'));
alter table public.recruitments add constraint recruitments_min_rank_chk
  check (min_rank is null or min_rank in ('f', 'e', 'd', 'c', 'b', 'a', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'));

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
  if p_rank_band is null or p_rank_band not in ('f', 'e', 'd', 'c', 'b', 'a', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9') then
    raise exception 'ランクを選んでください' using errcode = '22023';
  end if;
  update public.profiles set rank_band = p_rank_band, rank_confirmed = true where id = v_uid;
  if not found then
    raise exception '先に登録を完了してください' using errcode = 'P0002';
  end if;
end;
$$;

-- チャレンジバトル (3人)
alter table public.recruitments drop constraint if exists recruitments_purpose_chk;
alter table public.recruitments add constraint recruitments_purpose_chk
  check (purpose in ('tournament', 'rank', 'enjoy', 'custom', 'challenge'));
alter table public.profiles drop constraint if exists profiles_purposes_chk;
alter table public.profiles add constraint profiles_purposes_chk
  check (private.all_in(purposes, array['tournament', 'rank', 'enjoy', 'custom', 'challenge']));
