-- v10 (2026-10-06): 運営者の要望。2回流しても壊れない。
--  1) A以下のランクは細かく分けない (f〜b は a = 「A以下」にまとめる)。募集のランク条件は S1〜S9 だけ
--  2) チャットの規制を強める
--     - 漢数字で書いた電話番号 (〇九〇…) も弾く
--     - チャットでは、英字と数字が混ざった6文字以上 (ID らしいもの) と @ID を弾く
--     - 何回かに分けて送っても、直近3分の自分の発言をつなげて調べる
--     - 禁止語を追加 (一覧は src/lib/moderation/banned.ts と同じ並び)
--  3) 管理画面の通報: 通報した人と、通報された人 (対象の持ち主) の名前を返す

-- 1) ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_rank_band_chk;
alter table public.recruitments drop constraint if exists recruitments_min_rank_chk;
update public.profiles set rank_band = 'a' where rank_band in ('f', 'e', 'd', 'c', 'b');
update public.recruitments set min_rank = null where min_rank in ('f', 'e', 'd', 'c', 'b', 'a');
alter table public.profiles add constraint profiles_rank_band_chk
  check (rank_band in ('a', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'));
alter table public.recruitments add constraint recruitments_min_rank_chk
  check (min_rank is null or min_rank in ('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'));

-- 2) ---------------------------------------------------------------------
-- 漢数字の〇 (U+3007) も残す (漢数字の電話番号を見つけるため)
create or replace function private.normalize_for_filter(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(normalize(coalesce(p, ''), NFKC)), 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ', 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),
    '[^0-9a-zぁ-ゖー一-鿯々〇]', '', 'g');
$$;

create or replace function private.banned_terms()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'らいん交換', 'らいんこうかん', 'line交換', 'lineこうかん', 'らいん教', 'らいんおしえ', 'line教', 'lineおしえ',
    'らいんやって', 'lineやって', 'らいんid', 'lineid', 'かかお', 'kakao', 'いんすた', 'insta',
    'てぃっくとっく', 'tiktok', 'snapchat', 'telegram', 'てれぐらむ', 'whatsapp', 'kik', '電話番号',
    'でんわばんごう', '電番', 'めあど', 'めーるあど', 'gmail', 'icloud', '番号教', 'ばんごうおしえ',
    '住所', 'じゅうしょ', '本名', 'ほんみょう', '最寄', 'もより', 'どこ住', 'どこすみ',
    '何県', 'なにけん', '何歳', 'なんさい', '年齢', 'ねんれい', '何年生', 'なんねんせい',
    '小学', 'しょうがく', '中学', 'ちゅうがく', '高校', '学校', 'がっこう', 'jc',
    'jk', '会お', '会いたい', 'あいたい', '会える', 'あえる', 'おふかい', 'おふ会',
    '出会', 'であい', '付き合', 'つきあ', '恋人', 'こいびと', '彼女にな', 'かのじょにな',
    '彼氏にな', 'かれしにな', 'せふれ', 'ぱぱかつ', 'ままかつ', 'ぱぱ活', 'まま活', '援交',
    'えんこう', '援助交際', 'おふぱこ', 'えっち', 'えろい', 'えろ画像', 'せっくす', 'sex',
    'おなに', 'ぬーど', '裸', 'はだか', '下着', 'したぎ', 'ぱんつ', '自撮',
    'じどり', '顔写真', 'かおしゃしん', '写真送', 'しゃしんおく', '泊まり', 'ちんこ', 'まんこ',
    'ちんぽ', 'おっぱい', '大麻', '覚醒剤', '闇ばいと', 'やみばいと', '高収入', 'こうしゅうにゅう',
    '稼げ', 'かせげ', '振込', 'ふりこみ', '振り込', '口座', 'こうざ', '現金',
    'げんきん', '送金', 'そうきん', 'あまぎふ', 'ぎふと券', 'ぎふとけん', '代行', 'だいこう',
    '垢売', 'あかうり', 'rmt', 'ちーと', '死ね', 'しね', '殺す', 'ころす',
    '殺し', 'ころし', 'きもい', 'きもすぎ', 'うざい', 'がいじ', '池沼', 'ちしょう',
    '雑魚', 'ざこ', 'ついった', 'twitter', 'でぃーえむ', 'dmして', 'dmくだ', 'dmおく',
    'きえろ', '消えろ', 'ぶさいく', 'ぶす', 'でぶ', 'ごみ', 'ぱんちら', 'ふたりきり',
    '二人きり', 'ないしょで', '内緒で', 'ひみつで', '秘密で', '親には', 'おやには'
  ];
$$;

-- 漢数字を数字に置き換えた形でも、10桁以上の数字を調べる
create or replace function private.contains_banned(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text;
  t text;
begin
  if p is null or p = '' then
    return false;
  end if;
  if normalize(p, NFKC) ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return true;
  end if;
  n := private.normalize_for_filter(p);
  if translate(n, '〇零一二三四五六七八九', '00123456789') ~ '[0-9]{10,}' then
    return true;
  end if;
  foreach t in array private.banned_terms() loop
    if strpos(n, t) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- チャットだけ: ID らしいもの (英字と数字が混ざった6文字以上) と @ID
create or replace function private.contains_contact(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
begin
  if p is null or p = '' then
    return false;
  end if;
  if normalize(p, NFKC) ~* '@[a-z0-9_.]{3,}' then
    return true;
  end if;
  for m in select regexp_matches(private.normalize_for_filter(p), '[a-z0-9]{6,}', 'g') loop
    if m[1] ~ '[a-z]' and m[1] ~ '[0-9]' then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function private.limit_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent text;
begin
  if char_length(btrim(new.body)) > 20 then
    raise exception 'メッセージは20文字以内で入力してください' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception '続けて送信することはできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 8 then
    raise exception '送信が多すぎます。1分ほど待ってからお試しください' using errcode = 'P0429';
  end if;
  if exists (select 1 from public.messages
             where user_id = new.user_id and recruitment_id = new.recruitment_id
               and btrim(body) = btrim(new.body) and created_at > now() - interval '1 minute') then
    raise exception '同じ内容は続けて送信できません' using errcode = 'P0429';
  end if;
  if private.contains_contact(new.body) then
    raise exception '連絡先やIDは送信できません' using errcode = '22023';
  end if;
  -- 分けて送っても見つかるよう、直近3分の自分の発言 (4件まで) とつなげて調べる
  select string_agg(body, '' order by created_at) into v_recent
  from (
    select body, created_at from public.messages
    where user_id = new.user_id and recruitment_id = new.recruitment_id and created_at > now() - interval '3 minutes'
    order by created_at desc
    limit 4
  ) x;
  if v_recent is not null
     and (private.contains_banned(v_recent || new.body) or private.contains_contact(v_recent || new.body)) then
    raise exception '使用できない言葉が含まれています' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- 3) ---------------------------------------------------------------------
drop function if exists public.admin_report_summary();
create function public.admin_report_summary()
returns table (
  target_type text,
  target_id uuid,
  target_owner uuid,
  target_label text,
  reporter_count bigint,
  reasons text[],
  latest_at timestamptz,
  is_hidden boolean,
  owner_name text,
  reports jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select
      rp.target_type,
      rp.target_id,
      private.target_owner(rp.target_type, rp.target_id),
      case rp.target_type
        when 'user' then (select display_name from public.profiles where id = rp.target_id)
        when 'recruitment' then (select title from public.recruitments where id = rp.target_id)
        when 'message' then (select left(body, 80) from public.messages where id = rp.target_id)
      end,
      count(distinct rp.reporter_id),
      array_agg(rp.reason order by rp.created_at desc),
      max(rp.created_at),
      case rp.target_type
        when 'user' then (select hidden_at is not null from public.profiles where id = rp.target_id)
        when 'recruitment' then (select hidden_at is not null from public.recruitments where id = rp.target_id)
        when 'message' then (select hidden_at is not null from public.messages where id = rp.target_id)
      end,
      (select display_name from public.profiles where id = private.target_owner(rp.target_type, rp.target_id)),
      jsonb_agg(jsonb_build_object(
        'reporter_id', rp.reporter_id,
        'reporter_name', (select display_name from public.profiles where id = rp.reporter_id),
        'reason', rp.reason,
        'at', rp.created_at
      ) order by rp.created_at desc)
    from public.reports rp
    where rp.resolved_at is null
    group by rp.target_type, rp.target_id
    order by count(distinct rp.reporter_id) desc, max(rp.created_at) desc
    limit 200;
end;
$$;
revoke execute on function public.admin_report_summary() from public, anon;
grant execute on function public.admin_report_summary() to authenticated;
