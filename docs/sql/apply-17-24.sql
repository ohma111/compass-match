-- JOIN COMPASS: まだ本番に流していない変更をまとめたもの (migration 17〜24。18 は PR #6 の分)
-- 2回流しても壊れません。Supabase の SQL Editor に全部貼り付けて Run を押してください。
-- 18 を単独であとから流すと、一緒に遊んだ人の自動お気に入りが戻ります。必ずこのまとめで流してください。


-- ===================== 20261008000017_v13_report_evidence.sql =====================
-- v13 (2026-10-08): 通報の証拠を残す。2回流しても壊れない。
--  チャットの発言は募集終了の90分後に消えるので、管理画面で通報を見る頃には中身も送り主も分からず、
--  「通報された人をBAN」も出なかった。通報した時点の対象の文と持ち主を、通報の行に写しておく。
--  写した文は通報と一緒に消える (通報の削除・通報者のアカウント削除)。

alter table public.reports add column if not exists target_owner_id uuid;
alter table public.reports add column if not exists target_snapshot text;

create or replace function private.reports_fill_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.target_owner_id := coalesce(new.target_owner_id, private.target_owner(new.target_type, new.target_id));
  new.target_snapshot := coalesce(new.target_snapshot, left(case new.target_type
    when 'user' then (select display_name from public.profiles where id = new.target_id)
    when 'recruitment' then (select title from public.recruitments where id = new.target_id)
    when 'message' then (select body from public.messages where id = new.target_id)
  end, 200));
  return new;
end;
$$;

drop trigger if exists reports_fill_snapshot on public.reports;
create trigger reports_fill_snapshot
  before insert or update on public.reports
  for each row execute function private.reports_fill_snapshot();

-- 今ある通報にも、対象が残っていれば写す (トリガーが空の列を埋める)
update public.reports set target_owner_id = target_owner_id
  where target_owner_id is null or target_snapshot is null;

-- 管理画面: 対象が消えていても、写しておいた文と持ち主を出す (戻り値の形は v10 と同じ)
create or replace function public.admin_report_summary()
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
    with g as (
      select
        rp.target_type as t_type,
        rp.target_id as t_id,
        coalesce(
          private.target_owner(rp.target_type, rp.target_id),
          (array_agg(rp.target_owner_id order by rp.created_at) filter (where rp.target_owner_id is not null))[1]
        ) as owner_id,
        (array_agg(rp.target_snapshot order by rp.created_at) filter (where rp.target_snapshot is not null))[1] as snapshot,
        count(distinct rp.reporter_id) as cnt,
        array_agg(rp.reason order by rp.created_at desc) as reasons,
        max(rp.created_at) as latest,
        jsonb_agg(jsonb_build_object(
          'reporter_id', rp.reporter_id,
          'reporter_name', (select display_name from public.profiles where id = rp.reporter_id),
          'reason', rp.reason,
          'at', rp.created_at
        ) order by rp.created_at desc) as reports
      from public.reports rp
      where rp.resolved_at is null
      group by rp.target_type, rp.target_id
    )
    select
      g.t_type,
      g.t_id,
      g.owner_id,
      coalesce(case g.t_type
        when 'user' then (select display_name from public.profiles where id = g.t_id)
        when 'recruitment' then (select title from public.recruitments where id = g.t_id)
        when 'message' then (select left(body, 80) from public.messages where id = g.t_id)
      end, g.snapshot),
      g.cnt,
      g.reasons,
      g.latest,
      case g.t_type
        when 'user' then (select hidden_at is not null from public.profiles where id = g.t_id)
        when 'recruitment' then (select hidden_at is not null from public.recruitments where id = g.t_id)
        when 'message' then (select hidden_at is not null from public.messages where id = g.t_id)
      end,
      (select display_name from public.profiles where id = g.owner_id),
      g.reports
    from g
    order by g.cnt desc, g.latest desc
    limit 200;
end;
$$;
revoke execute on function public.admin_report_summary() from public, anon;
grant execute on function public.admin_report_summary() to authenticated;


-- ===================== 20261009000018_v14_security.sql =====================
-- =====================================================================
-- v14: 点検の対策
--   1) 通報による自動非表示をやめる (捨てアカウント3つで誰でも締め出せたため)。通報は記録だけ。
--      すでに非表示の人・募集は管理画面で戻す (ここでは触らない)
--   2) プッシュ通知の登録先を、各ブラウザのプッシュサーバーだけにする (任意の URL へ送らせない)
--   3) 運営バッジ: profiles.is_staff (user_roles の admin と同期)。管理者以外は「運営」「公式」などを名前に使えない
--   4) private.play_mates_counted に外部キー (募集・アカウントが消えたら一緒に消える)
--   5) 一緒に遊んだ人の自動の通知は30人まで。手動のベルも30人まで (前は200人)
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。
-- =====================================================================

-- 1) ---------------------------------------------------------------------
create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and banned_at is null) then
    raise exception 'このアカウントは現在利用できません' using errcode = '42501';
  end if;
  if p_target_type not in ('user', 'recruitment', 'message') then
    raise exception '通報対象が不正です' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception '通報理由を入力してください' using errcode = '22023';
  end if;

  v_owner := private.target_owner(p_target_type, p_target_id);
  if v_owner is null then
    raise exception '通報対象が見つかりません' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception '自分自身は通報できません' using errcode = '22023';
  end if;
  if p_target_type = 'message' and not private.is_member(
      (select recruitment_id from public.messages where id = p_target_id), v_uid) then
    raise exception '通報対象が見つかりません' using errcode = 'P0002';
  end if;

  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception '通報が多すぎます。時間をおいて再度お試しください' using errcode = 'P0429';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_uid, p_target_type, p_target_id, btrim(p_reason))
  on conflict (reporter_id, target_type, target_id)
  do update set reason = excluded.reason;

  -- v14: 自動では非表示にしない (判断は管理画面で)
  return false;
end;
$$;

-- 2) ---------------------------------------------------------------------
create or replace function private.is_push_endpoint(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and char_length(p) <= 1000 and p ~ (
    '^https://('
    || 'fcm\.googleapis\.com'                       -- Chrome / Edge (Android) / Samsung / Opera
    || '|([a-z0-9-]+\.)*push\.services\.mozilla\.com' -- Firefox
    || '|([a-z0-9-]+\.)*push\.apple\.com'            -- Safari (iPhone / Mac)
    || '|([a-z0-9-]+\.)*notify\.windows\.com'        -- Edge (Windows)
    || ')/'
  );
$$;

delete from public.push_subscriptions where not private.is_push_endpoint(endpoint);
alter table public.push_subscriptions drop constraint if exists push_endpoint_chk;
alter table public.push_subscriptions add constraint push_endpoint_chk check (private.is_push_endpoint(endpoint));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.is_push_endpoint(p_endpoint) then
    raise exception 'この端末では通知を登録できません' using errcode = '22023';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = v_uid) >= 5 then
    delete from public.push_subscriptions where id in (
      select id from public.push_subscriptions where user_id = v_uid order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = v_uid, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- 3) ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_staff boolean not null default false;
update public.profiles p set is_staff = exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin')
  where p.is_staff is distinct from exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin');
grant select (is_staff) on public.profiles to anon;
grant select (is_staff) on public.profiles to authenticated;

create or replace function private.sync_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set is_staff = exists (
    select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'admin'
  ) where id = v_uid;
  return null;
end;
$$;
drop trigger if exists user_roles_sync_staff on public.user_roles;
create trigger user_roles_sync_staff after insert or update or delete on public.user_roles
  for each row execute function private.sync_staff();

-- プロフィールを作るときも、管理者なら印を付ける (user_roles が先にある場合)
create or replace function private.set_staff_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_staff := exists (select 1 from public.user_roles r where r.user_id = new.id and r.role = 'admin');
  return new;
end;
$$;
drop trigger if exists profiles_set_staff on public.profiles;
create trigger profiles_set_staff before insert on public.profiles
  for each row execute function private.set_staff_on_insert();

-- 運営を名乗る名前 (ひらがな・小文字にそろえて、記号を除いてから調べる)
create or replace function private.is_reserved_name(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := private.normalize_for_filter(p);
  t text;
begin
  foreach t in array array[
    '運営', 'うんえい', '公式', 'こうしき', '管理人', '管理者', 'かんりにん', 'かんりしゃ',
    'すたっふ', 'staff', 'admin', 'moderator', 'official', 'joincompass'
  ] loop
    if strpos(n, t) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function private.reject_reserved_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and private.is_reserved_name(new.display_name)
     and not private.is_admin(new.id) then
    raise exception '運営と紛らわしい名前は使えません' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reject_reserved_name on public.profiles;
create trigger profiles_reject_reserved_name before insert or update of display_name on public.profiles
  for each row execute function private.reject_reserved_name();

-- 4) ---------------------------------------------------------------------
delete from private.play_mates_counted c
  where not exists (select 1 from public.recruitments r where r.id = c.recruitment_id)
     or not exists (select 1 from public.profiles p where p.id = c.user_id)
     or not exists (select 1 from public.profiles p where p.id = c.mate_id);
alter table private.play_mates_counted drop constraint if exists play_mates_counted_recruitment_fkey;
alter table private.play_mates_counted drop constraint if exists play_mates_counted_user_fkey;
alter table private.play_mates_counted drop constraint if exists play_mates_counted_mate_fkey;
alter table private.play_mates_counted
  add constraint play_mates_counted_recruitment_fkey foreign key (recruitment_id) references public.recruitments (id) on delete cascade,
  add constraint play_mates_counted_user_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  add constraint play_mates_counted_mate_fkey foreign key (mate_id) references public.profiles (id) on delete cascade;
create index if not exists play_mates_counted_user_idx on private.play_mates_counted (user_id);
create index if not exists play_mates_counted_mate_idx on private.play_mates_counted (mate_id);

-- 5) ---------------------------------------------------------------------
create or replace function private.record_play_mates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;
  for m in
    select r.owner_id from public.recruitments r where r.id = new.recruitment_id
    union
    select pa.user_id from public.participations pa
      where pa.recruitment_id = new.recruitment_id and pa.status = 'approved' and pa.user_id <> new.user_id
  loop
    continue when m = new.user_id;
    if not exists (select 1 from private.play_mates_counted c
                   where c.recruitment_id = new.recruitment_id and c.user_id = new.user_id and c.mate_id = m) then
      insert into private.play_mates_counted values (new.recruitment_id, new.user_id, m), (new.recruitment_id, m, new.user_id)
        on conflict do nothing;
      insert into public.play_mates as pm (user_id, mate_id) values (new.user_id, m), (m, new.user_id)
        on conflict (user_id, mate_id) do update set times = pm.times + 1, last_played_at = now();
      -- いっしょに遊んだ人の募集は、はじめから通知する (止めている人はそのまま)。v14: 通知を受け取る人が30人に達していたら足さない
      if not private.is_blocked_between(new.user_id, m) then
        if (select count(*) from public.follows where follower_id = new.user_id and active) < 30 then
          insert into public.follows (follower_id, followee_id) values (new.user_id, m) on conflict do nothing;
        end if;
        if (select count(*) from public.follows where follower_id = m and active) < 30 then
          insert into public.follows (follower_id, followee_id) values (m, new.user_id) on conflict do nothing;
        end if;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.set_follow(p_target uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_target is null or p_target = v_uid then
    raise exception '操作できませんでした' using errcode = '22023';
  end if;
  if p_on and private.is_blocked_between(v_uid, p_target) then
    raise exception 'この方の通知は受け取れません' using errcode = '22023';
  end if;
  if p_on
     and not exists (select 1 from public.follows where follower_id = v_uid and followee_id = p_target and active)
     and (select count(*) from public.follows where follower_id = v_uid and active) >= 30 then
    raise exception '通知を受け取れるのは30人までです。ほかの方のベルをオフにしてからお試しください' using errcode = 'P0429';
  end if;
  insert into public.follows (follower_id, followee_id, active) values (v_uid, p_target, p_on)
    on conflict (follower_id, followee_id) do update set active = excluded.active;
end;
$$;


-- ===================== 20261009000019_rls_initplan.sql =====================
-- =====================================================================
-- 読み込みを軽くする (アクセス集中の対策)
-- RLS の条件の auth.uid() と private.is_admin(...) を (select ...) で包み、
-- 1回の問い合わせにつき1回だけ計算させる (前は1行ごとに計算していた。Supabase の推奨: auth_rls_initplan)。
-- 見え方は変えない (条件の中身は同じ)。SQL Editor に貼って1回実行する。2回実行しても壊れない。
-- =====================================================================

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists app_settings_admin_select on public.app_settings;
create policy app_settings_admin_select on public.app_settings
  for select to authenticated using ((select private.is_admin((select auth.uid()))));

drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin((select auth.uid()))));

drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows
  for select to authenticated using (follower_id = (select auth.uid()));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    (select private.is_admin((select auth.uid())))
    or (
      private.is_member(recruitment_id, (select auth.uid()))
      and private.chat_available(recruitment_id)
      and hidden_at is null
      and not exists (
        select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = messages.user_id
      )
    )
  );

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists participations_select on public.participations;
create policy participations_select on public.participations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_owner(recruitment_id, (select auth.uid()))
    or (select private.is_admin((select auth.uid())))
    or (
      status = 'approved'
      and exists (select 1 from public.recruitments r where r.id = recruitment_id)
    )
  );

drop policy if exists play_mates_select_own on public.play_mates;
create policy play_mates_select_own on public.play_mates
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists presence_select on public.presence_now;
create policy presence_select on public.presence_now
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      expires_at > now()
      and private.is_active_user(user_id)
      and not private.is_blocked_between((select auth.uid()), user_id)
    )
  );

drop policy if exists contacts_select_own on public.profile_contacts;
create policy contacts_select_own on public.profile_contacts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin((select auth.uid())))
    or (banned_at is null and suspended_at is null and hidden_at is null)
  );

drop policy if exists recruitments_select_auth on public.recruitments;
create policy recruitments_select_auth on public.recruitments
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select private.is_admin((select auth.uid())))
    or private.is_member(id, (select auth.uid()))
    or (
      hidden_at is null
      and private.is_active_user(owner_id)
      and not private.is_blocked_between((select auth.uid()), owner_id)
    )
  );

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin((select auth.uid()))));

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));


-- ===================== 20261009000020_load_relief.sql =====================
-- =====================================================================
-- 負荷を減らす (2026-10-09 夜のダウンの対策 その2)
-- 1) ヘッダー用の読み込み (プロフィール・管理者か・未読数・Discord の有無) を1回の問い合わせにまとめる
--    前はページを開くたびに4回 (PostgREST への往復も4回) だった。アプリは関数がなければ前のやり方に戻る。
-- 2) 誰も Realtime で受け取っていない notifications を配信の対象から外す (変更の読み取りが無駄に動いていた)
-- 3) 管理画面の「容量を詰める」(VACUUM FULL) をやめる。実行中は全テーブルが止まり、混雑時はサイト全体が止まる。
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。19 とは独立 (どの順でもよい)。
-- =====================================================================

-- 1) 列は src/lib/profile-columns.ts の PROFILE_COLUMNS と同じにすること
create or replace function public.viewer_header()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, rank_band, play_roles, characters, purposes, vc, tags, bio,
               hidden_at, suspended_at, banned_at, created_at, rank_confirmed, avatar
        from public.profiles where id = (select auth.uid())
      ) p
    ),
    'is_admin', exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'),
    'unread', (select count(*) from public.notifications where user_id = (select auth.uid()) and read_at is null),
    'has_discord', coalesce((
      select coalesce(contact_discord, '') <> '' from public.profile_contacts where user_id = (select auth.uid())
    ), false)
  );
$$;
revoke execute on function public.viewer_header() from public, anon;
grant execute on function public.viewer_header() to authenticated;

-- 2)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end;
$$;

-- 3)
do $$
begin
  perform cron.unschedule('admin-compact');
exception when others then
  null;
end;
$$;
create or replace function public.admin_compact()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  raise exception '容量を詰める操作は廃止しました (自動の VACUUM で足ります)';
end;
$$;


-- ===================== 20261010000021_realtime_off.sql =====================
-- =====================================================================
-- チャットの即時配信を postgres_changes から Broadcast (中身のない合図) に変えたので、
-- messages を Realtime の配信対象から外す。
-- pg_stat_statements で、Realtime が DB の変更を読み続ける問い合わせ (realtime.list_changes) が
-- DB の CPU 時間の6割以上を使っていた (6万回・計385秒)。
-- 古い画面を開いたままの方は、次の読み込みまで20秒ごとの確認で新しい発言を受け取る。
-- SQL Editor に貼って1回実行する。2回実行しても壊れない。20 とは独立。
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'notifications'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end;
$$;


-- ===================== 20261010000022_feedback_fixes.sql =====================
-- v14 (2026-10-10): 利用者のフィードバックへの対応。2回流しても壊れない。
--  1) チャット: 1回50文字まで (前は20文字)。
--     直近の発言をつなげて調べるとき、4桁の数字だけの発言 (部屋番号) はつなげない。
--     前は「1234」「5678」「9012」と部屋番号を送り直すと10桁以上の数字 (電話番号) と見なされ、
--     「ok」「1234」でも ID らしいもの (英字と数字の6文字) と見なされて「使用できない言葉」になっていた。
--     電話番号 (0 で始まる10桁以上) は、分けて送られても今までどおり弾く。
--  2) 部屋番号: 参加が確定したメンバーも入力・変更できる。変わったら、ほかのメンバーに通知する (room_code)。
--  3) 募集の延長: 募集者は終了前なら30分・1時間ずつ延ばせる (開始から6時間まで。表の制約と同じ)。
--  4) チャットの通知を募集ごとに止める (chat_mutes)。止めた募集の新着メッセージ通知はプッシュしない。
--  5) お気に入りの募集通知を減らす
--     - 一緒に遊んだ人を自動でお気に入りに入れない (これまでに入ったものはそのまま。ベルで外せる)
--     - 同じ方の募集は3時間に1回まで。お気に入りの募集通知は1人あたり3時間に5件まで
--  6) 参加の申請: 募集者に外された (見送られた) 募集では、その理由を伝える

-- 1) ---------------------------------------------------------------------
create or replace function private.limit_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent text;
  v_raw text;
  v_new text;
begin
  if char_length(btrim(new.body)) > 50 then
    raise exception 'メッセージは50文字以内で入力してください' using errcode = '22023';
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
  -- 分けて送っても見つかるよう、直近3分の自分の発言 (4件まで) とつなげて調べる。
  -- 4桁の数字だけの発言は部屋番号として扱い、つなげない (区切りの「ー」に置き換える)。
  -- ただし電話番号 (0 で始まる10桁以上) は、部屋番号の形に分けて送られても見つける
  select string_agg(
           case when btrim(normalize(body, NFKC)) ~ '^[0-9]{4}$' then 'ー' else body end,
           '' order by created_at),
         string_agg(body, '' order by created_at)
    into v_recent, v_raw
  from (
    select body, created_at from public.messages
    where user_id = new.user_id and recruitment_id = new.recruitment_id and created_at > now() - interval '3 minutes'
    order by created_at desc
    limit 4
  ) x;
  v_new := case when btrim(normalize(new.body, NFKC)) ~ '^[0-9]{4}$' then 'ー' else new.body end;
  if v_recent is not null
     and (private.contains_banned(v_recent || v_new) or private.contains_contact(v_recent || v_new)
          or translate(private.normalize_for_filter(v_raw || new.body), '〇零一二三四五六七八九', '00123456789') ~ '0[0-9]{9,}') then
    raise exception '使用できない言葉が含まれています' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- 2) ---------------------------------------------------------------------
alter table public.recruitment_secrets add column if not exists updated_by uuid;

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code'
));

create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_code text := nullif(btrim(p_room_code), '');
  v_old text;
  r public.recruitments;
  m record;
begin
  if not private.is_member(p_recruitment_id, v_uid) then
    raise exception '参加が確定したメンバーだけが変更できます' using errcode = '42501';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id;
  if r.status = 'cancelled' or r.hidden_at is not null or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  if v_code is not null and v_code !~ '^[0-9]{4}$' then
    raise exception '部屋番号は4桁の数字で入力してください' using errcode = '22023';
  end if;
  select room_code into v_old from public.recruitment_secrets where recruitment_id = p_recruitment_id;
  insert into public.recruitment_secrets (recruitment_id, room_code, updated_by)
  values (p_recruitment_id, v_code, v_uid)
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_by = excluded.updated_by, updated_at = now();
  -- 番号が変わったら、ほかのメンバーに知らせる (まだ読んでいない前の知らせは消して1件にする)
  if v_code is not null and v_code is distinct from v_old then
    for m in
      select r.owner_id as uid
      union
      select pa.user_id from public.participations pa
      where pa.recruitment_id = p_recruitment_id and pa.status = 'approved'
    loop
      continue when m.uid = v_uid;
      delete from public.notifications
        where user_id = m.uid and recruitment_id = p_recruitment_id and kind = 'room_code' and read_at is null;
      perform private.notify(m.uid, 'room_code', p_recruitment_id);
    end loop;
  end if;
end;
$$;
revoke execute on function public.set_room_code(uuid, text) from public, anon;
grant execute on function public.set_room_code(uuid, text) to authenticated;

-- 部屋番号と、最後に変えた方・時刻 (メンバーだけ)
create or replace function public.get_room_info(p_recruitment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_recruitment_id, auth.uid()) then
    return null;
  end if;
  return (
    select jsonb_build_object('code', s.room_code, 'updated_at', s.updated_at, 'updated_by', s.updated_by)
    from public.recruitment_secrets s where s.recruitment_id = p_recruitment_id
  );
end;
$$;
revoke execute on function public.get_room_info(uuid) from public, anon;
grant execute on function public.get_room_info(uuid) to authenticated;

-- 3) ---------------------------------------------------------------------
create or replace function public.extend_recruitment(p_recruitment_id uuid, p_minutes int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_end timestamptz;
begin
  if p_minutes not in (30, 60) then
    raise exception '延長できるのは30分か1時間です' using errcode = '22023';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ延長できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.hidden_at is not null or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  v_end := least(r.ends_at + make_interval(mins => p_minutes), r.starts_at + interval '6 hours');
  if v_end <= r.ends_at then
    raise exception '開始から6時間より先には延長できません' using errcode = '22023';
  end if;
  update public.recruitments set ends_at = v_end where id = r.id;
  return v_end;
end;
$$;
revoke execute on function public.extend_recruitment(uuid, int) from public, anon;
grant execute on function public.extend_recruitment(uuid, int) to authenticated;

-- 4) ---------------------------------------------------------------------
create table if not exists public.chat_mutes (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  recruitment_id uuid not null references public.recruitments (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, recruitment_id)
);
create index if not exists chat_mutes_recruitment_idx on public.chat_mutes (recruitment_id);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from public, anon, authenticated;
grant select on public.chat_mutes to authenticated;
drop policy if exists chat_mutes_select_own on public.chat_mutes;
create policy chat_mutes_select_own on public.chat_mutes
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.set_chat_mute(p_recruitment_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if p_on then
    if not private.is_member(p_recruitment_id, v_uid) then
      raise exception 'このチャットには参加していません' using errcode = '42501';
    end if;
    insert into public.chat_mutes (user_id, recruitment_id) values (v_uid, p_recruitment_id) on conflict do nothing;
  else
    delete from public.chat_mutes where user_id = v_uid and recruitment_id = p_recruitment_id;
  end if;
end;
$$;
revoke execute on function public.set_chat_mute(uuid, boolean) from public, anon;
grant execute on function public.set_chat_mute(uuid, boolean) to authenticated;

-- 止めた募集の新着メッセージ通知は、通知欄には残し、プッシュはしない (送信済みの印を先に付ける)
create or replace function private.skip_muted_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'new_message' and new.recruitment_id is not null and exists (
    select 1 from public.chat_mutes c where c.user_id = new.user_id and c.recruitment_id = new.recruitment_id
  ) then
    new.pushed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_skip_muted_push on public.notifications;
create trigger notifications_skip_muted_push before insert on public.notifications
  for each row execute function private.skip_muted_push();

-- 5) ---------------------------------------------------------------------
create or replace function private.record_play_mates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;
  for m in
    select r.owner_id from public.recruitments r where r.id = new.recruitment_id
    union
    select pa.user_id from public.participations pa
      where pa.recruitment_id = new.recruitment_id and pa.status = 'approved' and pa.user_id <> new.user_id
  loop
    continue when m = new.user_id;
    if not exists (select 1 from private.play_mates_counted c
                   where c.recruitment_id = new.recruitment_id and c.user_id = new.user_id and c.mate_id = m) then
      insert into private.play_mates_counted values (new.recruitment_id, new.user_id, m), (new.recruitment_id, m, new.user_id)
        on conflict do nothing;
      insert into public.play_mates as pm (user_id, mate_id) values (new.user_id, m), (m, new.user_id)
        on conflict (user_id, mate_id) do update set times = pm.times + 1, last_played_at = now();
      -- v14: お気に入り (募集の通知) には自動で入れない。入れるかはベルで本人が決める
    end if;
  end loop;
  return new;
end;
$$;

create index if not exists notifications_followed_idx on public.notifications (user_id, created_at)
  where kind = 'followed_posted';

create or replace function private.notify_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, recruitment_id)
  select f.follower_id, 'followed_posted', new.id
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = new.owner_id
    and f.active
    and p.banned_at is null
    and not private.is_blocked_between(f.follower_id, new.owner_id)
    -- 同じ方の募集は3時間に1回まで
    and not exists (
      select 1 from public.notifications n
      join public.recruitments r2 on r2.id = n.recruitment_id
      where n.user_id = f.follower_id and n.kind = 'followed_posted'
        and n.created_at > now() - interval '3 hours' and r2.owner_id = new.owner_id
    )
    -- お気に入りの募集通知は、1人あたり3時間に5件まで
    and (
      select count(*) from public.notifications n
      where n.user_id = f.follower_id and n.kind = 'followed_posted' and n.created_at > now() - interval '3 hours'
    ) < 5;
  return new;
end;
$$;

-- 6) ---------------------------------------------------------------------
create or replace function public.request_join(p_recruitment_id uuid, p_src text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_existing public.participations;
  v_id uuid;
  v_status text;
  v_count int;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.hidden_at is not null or not private.is_active_user(r.owner_id) then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  if r.owner_id = v_uid then
    raise exception '自分の募集には申請できません' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_uid, r.owner_id) then
    -- ブロック関係の有無は相手に伝わらないよう、一般的な文言にする
    raise exception 'この募集には申請できません' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) <> 'open' then
    raise exception 'この募集は現在受け付けていません' using errcode = '22023';
  end if;
  if r.approved_count >= r.capacity - 1 then
    raise exception '満員です' using errcode = '22023';
  end if;

  if (select count(*) from public.participations
      where user_id = v_uid and updated_at > now() - interval '10 minutes') >= 10 then
    raise exception '参加申請が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;

  v_status := case when r.join_mode = 'instant' then 'approved' else 'pending' end;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception '募集者に見送られた (外された) 募集には、もう一度参加できません' using errcode = '42501';
    end if;
    update public.participations
      set status = v_status,
          decided_at = case when v_status = 'approved' then now() end,
          src = coalesce(private.clean_src(p_src), src)
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src, decided_at)
    values (r.id, v_uid, v_status, private.clean_src(p_src), case when v_status = 'approved' then now() end)
    returning id into v_id;
  end if;

  if v_status = 'approved' then
    v_count := r.approved_count + 1;
    update public.recruitments set
      approved_count = v_count,
      status = case when v_count >= capacity - 1 then 'full' else status end,
      filled_at = case when v_count >= capacity - 1 then now() else filled_at end
    where id = r.id;
    perform private.notify(r.owner_id, 'joined', r.id);
  else
    perform private.notify(r.owner_id, 'join_request', r.id);
  end if;
  return v_id;
end;
$$;


-- ===================== 20261011000023_recruit_rules.sql =====================
-- v15 (2026-10-11): 運営者の指定。2回流しても壊れない。migration 22 のあとに流す。
--  1) 部屋番号が変わっても通知しない (migration 22 の通知をやめる)
--  2) 自動で入っていた「一緒に遊んだ人のお気に入り」をオフにする
--     (自動の行は、相手側の行と作成時刻がまったく同じ = 同じ処理で両方向に作られたもの)
--  3) 募集の項目を足す
--     - duo_ok: 2固定でも可 (バトルアリーナ・フリーバトル)
--     - wanted_roles: ほしいロール (任意)
--     - バトルアリーナの承認制だけ: 募集者のデキレ・コラボ数と、参加の条件 (デキレ・コラボ数の下限)
--       デキレは 120〜240 の10刻み、コラボ数は1以上の整数。参加を申し込む方も申告する (participations に残す)
--  4) 予定時刻になったら、募集者と参加が確定した方に「予定時刻になりました」(starting)
--     開始から60分たっても始まらない募集 (人がそろわない) は自動で閉じ、同じ方々に知らせる (auto_closed)
--     始まったとみなすもの: 満員 / 2固定でも可で1人以上 / カスタムで1人以上
--     毎分の定期処理 (compass-tick)。作った知らせは pg_net でサイトの /api/push/dispatch を呼んでプッシュする

-- 1) ---------------------------------------------------------------------
alter table public.recruitment_secrets add column if not exists updated_by uuid;
create or replace function public.set_room_code(p_recruitment_id uuid, p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_code text := nullif(btrim(p_room_code), '');
  r public.recruitments;
begin
  if not private.is_member(p_recruitment_id, v_uid) then
    raise exception '参加が確定したメンバーだけが変更できます' using errcode = '42501';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id;
  if r.status = 'cancelled' or r.hidden_at is not null or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  if v_code is not null and v_code !~ '^[0-9]{4}$' then
    raise exception '部屋番号は4桁の数字で入力してください' using errcode = '22023';
  end if;
  insert into public.recruitment_secrets (recruitment_id, room_code, updated_by)
  values (p_recruitment_id, v_code, v_uid)
  on conflict (recruitment_id) do update set room_code = excluded.room_code, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
delete from public.notifications where kind = 'room_code';

-- 2) ---------------------------------------------------------------------
update public.follows f set active = false
where f.active
  and exists (
    select 1 from public.follows g
    where g.follower_id = f.followee_id and g.followee_id = f.follower_id and g.created_at = f.created_at
  );

-- 3) ---------------------------------------------------------------------
alter table public.recruitments add column if not exists duo_ok boolean not null default false;
alter table public.recruitments add column if not exists wanted_roles text[] not null default '{}';
alter table public.recruitments add column if not exists owner_deck_level int;
alter table public.recruitments add column if not exists owner_collab int;
alter table public.recruitments add column if not exists min_deck_level int;
alter table public.recruitments add column if not exists min_collab int;
alter table public.recruitments add column if not exists start_notified_at timestamptz;
alter table public.recruitments drop constraint if exists recruitments_wanted_roles_chk;
alter table public.recruitments add constraint recruitments_wanted_roles_chk
  check (private.all_in(wanted_roles, array['attacker', 'gunner', 'tank', 'sprinter']));
alter table public.recruitments drop constraint if exists recruitments_deck_chk;
alter table public.recruitments add constraint recruitments_deck_chk check (
  (owner_deck_level is null or (owner_deck_level between 120 and 240 and owner_deck_level % 10 = 0))
  and (min_deck_level is null or (min_deck_level between 120 and 240 and min_deck_level % 10 = 0))
  and (owner_collab is null or owner_collab between 1 and 9999)
  and (min_collab is null or min_collab between 1 and 9999)
);
alter table public.participations add column if not exists deck_level int;
alter table public.participations add column if not exists collab int;
alter table public.participations drop constraint if exists participations_deck_chk;
alter table public.participations add constraint participations_deck_chk check (
  (deck_level is null or (deck_level between 120 and 240 and deck_level % 10 = 0))
  and (collab is null or collab between 1 and 9999)
);
-- 前からある募集は、予定時刻の知らせを出さない
update public.recruitments set start_notified_at = now() where start_notified_at is null and starts_at <= now() + interval '1 minute';

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text);
drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int);
create or replace function public.create_recruitment(
  p_title text,
  p_purpose text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity int,
  p_min_rank text,
  p_vc text,
  p_tags text[],
  p_note text,
  p_room_code text,
  p_src text default null,
  p_join_mode text default 'instant',
  p_stance text default 'fun',
  p_duo_ok boolean default false,
  p_wanted_roles text[] default '{}',
  p_owner_deck_level int default null,
  p_owner_collab int default null,
  p_min_deck_level int default null,
  p_min_collab int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_id uuid;
  v_deck boolean := p_purpose = 'rank' and p_join_mode = 'approval';
begin
  if p_starts_at < now() - interval '30 minutes' or p_starts_at > now() + interval '7 days' then
    raise exception '開始日時が範囲外です' using errcode = '22023';
  end if;
  if p_purpose is distinct from 'custom' and p_capacity > 3 then
    raise exception 'カスタム以外の募集は3人までです' using errcode = '22023';
  end if;
  if p_join_mode is null or p_join_mode not in ('instant', 'approval') then
    raise exception '参加方式が不正です' using errcode = '22023';
  end if;
  if p_stance is null or p_stance not in ('win', 'fun') then
    raise exception 'ゲームへの姿勢を選んでください' using errcode = '22023';
  end if;
  -- デキレ・コラボ数はバトルアリーナの承認制だけ。そのときは募集者の値が必須
  if v_deck and (p_owner_deck_level is null or p_owner_collab is null) then
    raise exception 'あなたのデキレとコラボ数を入力してください' using errcode = '22023';
  end if;

  if (select count(*) from public.recruitments
      where owner_id = v_uid and created_at > now() - interval '1 hour') >= 3 then
    raise exception '募集の作成が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.recruitments
      where owner_id = v_uid and status in ('open', 'full') and ends_at > now()) >= 3 then
    raise exception '同時に出せる募集は3件までです' using errcode = 'P0429';
  end if;

  insert into public.recruitments (
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src, join_mode, stance,
    duo_ok, wanted_roles, owner_deck_level, owner_collab, min_deck_level, min_collab, start_notified_at
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src), p_join_mode, p_stance,
    coalesce(p_duo_ok, false) and p_purpose in ('rank', 'enjoy') and p_capacity = 3,
    coalesce(p_wanted_roles, '{}'),
    case when v_deck then p_owner_deck_level end,
    case when v_deck then p_owner_collab end,
    case when v_deck then p_min_deck_level end,
    case when v_deck then p_min_collab end,
    -- 「今すぐ」(開始が作成から1分以内) は予定時刻の知らせを出さない
    case when p_starts_at <= now() + interval '1 minute' then now() end
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;
revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int) to authenticated;

drop function if exists public.request_join(uuid, text);
drop function if exists public.request_join(uuid, text, int, int);
create or replace function public.request_join(
  p_recruitment_id uuid,
  p_src text default null,
  p_deck_level int default null,
  p_collab int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_existing public.participations;
  v_id uuid;
  v_status text;
  v_count int;
  v_deck boolean;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.hidden_at is not null or not private.is_active_user(r.owner_id) then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  if r.owner_id = v_uid then
    raise exception '自分の募集には申請できません' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_uid, r.owner_id) then
    -- ブロック関係の有無は相手に伝わらないよう、一般的な文言にする
    raise exception 'この募集には申請できません' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) <> 'open' then
    raise exception 'この募集は現在受け付けていません' using errcode = '22023';
  end if;
  if r.approved_count >= r.capacity - 1 then
    raise exception '満員です' using errcode = '22023';
  end if;

  if (select count(*) from public.participations
      where user_id = v_uid and updated_at > now() - interval '10 minutes') >= 10 then
    raise exception '参加申請が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;

  -- デキレ・コラボ数を聞く募集 (バトルアリーナの承認制) は申告が必要。条件があれば下回る方は申し込めない
  v_deck := r.owner_deck_level is not null;
  if v_deck then
    if p_deck_level is null or p_collab is null then
      raise exception 'デキレとコラボ数を入力してください' using errcode = '22023';
    end if;
    if p_deck_level not between 120 and 240 or p_deck_level % 10 <> 0 or p_collab not between 1 and 9999 then
      raise exception 'デキレとコラボ数を選び直してください' using errcode = '22023';
    end if;
    if (r.min_deck_level is not null and p_deck_level < r.min_deck_level)
       or (r.min_collab is not null and p_collab < r.min_collab) then
      raise exception 'デキレ・コラボ数の条件を満たしていないため、申し込めません' using errcode = '22023';
    end if;
  end if;

  v_status := case when r.join_mode = 'instant' then 'approved' else 'pending' end;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception '募集者に見送られた (外された) 募集には、もう一度参加できません' using errcode = '42501';
    end if;
    update public.participations
      set status = v_status,
          decided_at = case when v_status = 'approved' then now() end,
          src = coalesce(private.clean_src(p_src), src),
          deck_level = case when v_deck then p_deck_level end,
          collab = case when v_deck then p_collab end
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src, decided_at, deck_level, collab)
    values (r.id, v_uid, v_status, private.clean_src(p_src), case when v_status = 'approved' then now() end,
            case when v_deck then p_deck_level end, case when v_deck then p_collab end)
    returning id into v_id;
  end if;

  if v_status = 'approved' then
    v_count := r.approved_count + 1;
    update public.recruitments set
      approved_count = v_count,
      status = case when v_count >= capacity - 1 then 'full' else status end,
      filled_at = case when v_count >= capacity - 1 then now() else filled_at end
    where id = r.id;
    perform private.notify(r.owner_id, 'joined', r.id);
  else
    perform private.notify(r.owner_id, 'join_request', r.id);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.request_join(uuid, text, int, int) from public, anon;
grant execute on function public.request_join(uuid, text, int, int) to authenticated;

-- 4) ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code', 'starting', 'auto_closed'
));

create index if not exists recruitments_start_notify_idx on public.recruitments (starts_at)
  where start_notified_at is null;

insert into public.app_settings (key, value) values ('site_url', '"https://compass-match.vercel.app"')
  on conflict (key) do nothing;
insert into public.server_secrets (key, value)
  values ('dispatch_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

-- 予定時刻の知らせと、始まらなかった募集を閉じる。作った知らせの件数を返す
create or replace function private.tick_recruitments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    update public.recruitments set start_notified_at = now()
    where start_notified_at is null and starts_at <= now()
      and status in ('open', 'full') and hidden_at is null and ends_at > now()
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'starting', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;

  for r in
    update public.recruitments set status = 'ended', ends_at = now()
    where status = 'open' and hidden_at is null
      and starts_at + interval '60 minutes' <= now() and ends_at > now()
      and not (approved_count >= 1 and (duo_ok or purpose = 'custom'))
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'auto_closed', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 知らせを作ったら、サイトにプッシュを送らせる (pg_net があるときだけ)
create or replace function private.tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if private.tick_recruitments() = 0 then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  select value #>> '{}' into v_url from public.app_settings where key = 'site_url';
  select value into v_token from public.server_secrets where key = 'dispatch_token';
  if v_url is null or v_token is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb)'
    using v_url || '/api/push/dispatch', jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-token', v_token);
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('compass-tick') where exists (select 1 from cron.job where jobname = 'compass-tick');
    perform cron.schedule('compass-tick', '* * * * *', 'select private.tick()');
  end if;
end $$;


-- ===================== 20261011000024_chat_open_close_check.sql =====================
-- v16 (2026-10-11 夜): 運営者の指定。2回流しても壊れない。migration 23 のあとに流す。
--  1) チャット: 参加が確定していなくても、プロフィールのある方なら受付中の募集のチャットを読み書きできる
--     (部屋番号・連絡先は今までどおり参加確定のメンバーだけ。新着の知らせもメンバーだけ)
--  2) 始まらない募集: 開始 (または「続ける」を押した時刻) から55分で募集者に確認 (close_check)。
--     5分以内に「続ける」がなければ取り消し、募集者と参加者に知らせる (auto_closed)。満員は対象外。
--     migration 23 の「60分で自動終了」はやめる
--  3) 2固定中 (duo_playing): バトルアリーナ・フリーバトルの3人募集で1人以上いるとき、募集者が切り替える。
--     確認・取り消しの対象外。終了時刻が近づくと30分ずつ自動で延ばす (開始から6時間まで)。参加者が0人になったら戻す
--  4) コラボ数は0以上
--  5) 募集者が使うロール (owner_roles)

-- 1) ---------------------------------------------------------------------
create or replace function private.can_chat(p_recruitment_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and (
    private.is_member(p_recruitment_id, p_uid)
    or exists (
      select 1 from public.recruitments r
      join public.profiles p on p.id = p_uid
      where r.id = p_recruitment_id
        and r.status in ('open', 'full') and r.ends_at > now() and r.hidden_at is null
        and p.banned_at is null and p.hidden_at is null
        and not private.is_blocked_between(p_uid, r.owner_id)
    )
  );
$$;
grant execute on function private.can_chat(uuid, uuid) to authenticated;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    (select private.is_admin((select auth.uid())))
    or (
      private.can_chat(recruitment_id, (select auth.uid()))
      and private.chat_available(recruitment_id)
      and hidden_at is null
      and not exists (
        select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = messages.user_id
      )
    )
  );

create or replace function public.send_message(p_recruitment_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_body text := btrim(p_body);
  v_id uuid;
  m record;
begin
  if not private.can_chat(p_recruitment_id, v_uid) then
    raise exception 'このチャットには書き込めません' using errcode = '42501';
  end if;
  select * into r from public.recruitments where id = p_recruitment_id;
  if r.status = 'cancelled' or r.hidden_at is not null then
    raise exception 'この募集のチャットは利用できません' using errcode = '22023';
  end if;
  if r.ends_at <= now() then
    raise exception '募集が終了したため送信できません' using errcode = '22023';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 300 then
    raise exception 'メッセージは1〜300文字で入力してください' using errcode = '22023';
  end if;
  if private.contains_url(v_body) then
    raise exception 'URLは送信できません' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages where user_id = v_uid and created_at > now() - interval '2 seconds') then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.messages where user_id = v_uid and created_at > now() - interval '30 seconds') >= 5 then
    raise exception '連続投稿はできません。少し待ってから送信してください' using errcode = 'P0429';
  end if;

  insert into public.messages (recruitment_id, user_id, body) values (p_recruitment_id, v_uid, v_body)
  returning id into v_id;

  -- 新着の知らせは募集者と参加確定のメンバーだけ (未読の新着がない方に1件)
  for m in
    select r.owner_id as uid
    union
    select pa.user_id from public.participations pa
    where pa.recruitment_id = p_recruitment_id and pa.status = 'approved'
  loop
    if m.uid <> v_uid and not exists (
      select 1 from public.notifications n
      where n.user_id = m.uid and n.recruitment_id = p_recruitment_id
        and n.kind = 'new_message' and n.read_at is null
    ) then
      perform private.notify(m.uid, 'new_message', p_recruitment_id);
    end if;
  end loop;

  return v_id;
end;
$$;

-- 2) 3) 5) ---------------------------------------------------------------
alter table public.recruitments add column if not exists close_check_at timestamptz;
alter table public.recruitments add column if not exists alive_at timestamptz;
alter table public.recruitments add column if not exists duo_playing boolean not null default false;
alter table public.recruitments add column if not exists owner_roles text[] not null default '{}';
alter table public.recruitments drop constraint if exists recruitments_owner_roles_chk;
alter table public.recruitments add constraint recruitments_owner_roles_chk
  check (private.all_in(owner_roles, array['attacker', 'gunner', 'tank', 'sprinter']));

-- 4) ---------------------------------------------------------------------
alter table public.recruitments drop constraint if exists recruitments_deck_chk;
alter table public.recruitments add constraint recruitments_deck_chk check (
  (owner_deck_level is null or (owner_deck_level between 120 and 240 and owner_deck_level % 10 = 0))
  and (min_deck_level is null or (min_deck_level between 120 and 240 and min_deck_level % 10 = 0))
  and (owner_collab is null or owner_collab between 0 and 9999)
  and (min_collab is null or min_collab between 0 and 9999)
);
alter table public.participations drop constraint if exists participations_deck_chk;
alter table public.participations add constraint participations_deck_chk check (
  (deck_level is null or (deck_level between 120 and 240 and deck_level % 10 = 0))
  and (collab is null or collab between 0 and 9999)
);

alter table public.notifications drop constraint if exists notifications_kind_chk;
alter table public.notifications add constraint notifications_kind_chk check (kind in (
  'join_request', 'joined', 'approved', 'rejected', 'removed',
  'participant_cancelled', 'recruitment_cancelled', 'new_message', 'followed_posted', 'blocked_joined',
  'filled', 'announcement', 'room_code', 'starting', 'auto_closed', 'close_check'
));

drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int);
drop function if exists public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]);
create or replace function public.create_recruitment(
  p_title text,
  p_purpose text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity int,
  p_min_rank text,
  p_vc text,
  p_tags text[],
  p_note text,
  p_room_code text,
  p_src text default null,
  p_join_mode text default 'instant',
  p_stance text default 'fun',
  p_duo_ok boolean default false,
  p_wanted_roles text[] default '{}',
  p_owner_deck_level int default null,
  p_owner_collab int default null,
  p_min_deck_level int default null,
  p_min_collab int default null,
  p_owner_roles text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_id uuid;
  v_deck boolean := p_purpose = 'rank' and p_join_mode = 'approval';
begin
  if p_starts_at < now() - interval '30 minutes' or p_starts_at > now() + interval '7 days' then
    raise exception '開始日時が範囲外です' using errcode = '22023';
  end if;
  if p_purpose is distinct from 'custom' and p_capacity > 3 then
    raise exception 'カスタム以外の募集は3人までです' using errcode = '22023';
  end if;
  if p_join_mode is null or p_join_mode not in ('instant', 'approval') then
    raise exception '参加方式が不正です' using errcode = '22023';
  end if;
  if p_stance is null or p_stance not in ('win', 'fun') then
    raise exception 'ゲームへの姿勢を選んでください' using errcode = '22023';
  end if;
  -- デキレ・コラボ数はバトルアリーナの承認制だけ。そのときは募集者の値が必須
  if v_deck and (p_owner_deck_level is null or p_owner_collab is null) then
    raise exception 'あなたのデキレとコラボ数を入力してください' using errcode = '22023';
  end if;

  if (select count(*) from public.recruitments
      where owner_id = v_uid and created_at > now() - interval '1 hour') >= 3 then
    raise exception '募集の作成が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;
  if (select count(*) from public.recruitments
      where owner_id = v_uid and status in ('open', 'full') and ends_at > now()) >= 3 then
    raise exception '同時に出せる募集は3件までです' using errcode = 'P0429';
  end if;

  insert into public.recruitments (
    owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, src, join_mode, stance,
    duo_ok, wanted_roles, owner_deck_level, owner_collab, min_deck_level, min_collab, start_notified_at, owner_roles
  ) values (
    v_uid, btrim(p_title), p_purpose, p_starts_at, p_ends_at, p_capacity, p_min_rank, p_vc,
    coalesce(p_tags, '{}'), coalesce(p_note, ''), private.clean_src(p_src), p_join_mode, p_stance,
    coalesce(p_duo_ok, false) and p_purpose in ('rank', 'enjoy') and p_capacity = 3,
    coalesce(p_wanted_roles, '{}'),
    case when v_deck then p_owner_deck_level end,
    case when v_deck then p_owner_collab end,
    case when v_deck then p_min_deck_level end,
    case when v_deck then p_min_collab end,
    -- 「今すぐ」(開始が作成から1分以内) は予定時刻の知らせを出さない
    case when p_starts_at <= now() + interval '1 minute' then now() end,
    coalesce(p_owner_roles, '{}')
  ) returning id into v_id;

  insert into public.recruitment_secrets (recruitment_id, room_code)
  values (v_id, nullif(btrim(p_room_code), ''));

  return v_id;
end;
$$;
revoke execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]) from public, anon;
grant execute on function public.create_recruitment(text, text, timestamptz, timestamptz, int, text, text, text[], text, text, text, text, text, boolean, text[], int, int, int, int, text[]) to authenticated;

drop function if exists public.request_join(uuid, text, int, int);
create or replace function public.request_join(
  p_recruitment_id uuid,
  p_src text default null,
  p_deck_level int default null,
  p_collab int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
  v_existing public.participations;
  v_id uuid;
  v_status text;
  v_count int;
  v_deck boolean;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.hidden_at is not null or not private.is_active_user(r.owner_id) then
    raise exception '募集が見つかりません' using errcode = 'P0002';
  end if;
  if r.owner_id = v_uid then
    raise exception '自分の募集には申請できません' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_uid, r.owner_id) then
    -- ブロック関係の有無は相手に伝わらないよう、一般的な文言にする
    raise exception 'この募集には申請できません' using errcode = '42501';
  end if;
  if private.effective_status(r.status, r.ends_at) <> 'open' then
    raise exception 'この募集は現在受け付けていません' using errcode = '22023';
  end if;
  if r.approved_count >= r.capacity - 1 then
    raise exception '満員です' using errcode = '22023';
  end if;

  if (select count(*) from public.participations
      where user_id = v_uid and updated_at > now() - interval '10 minutes') >= 10 then
    raise exception '参加申請が多すぎます。しばらく待ってから再度お試しください' using errcode = 'P0429';
  end if;

  -- デキレ・コラボ数を聞く募集 (バトルアリーナの承認制) は申告が必要。条件があれば下回る方は申し込めない
  v_deck := r.owner_deck_level is not null;
  if v_deck then
    if p_deck_level is null or p_collab is null then
      raise exception 'デキレとコラボ数を入力してください' using errcode = '22023';
    end if;
    if p_deck_level not between 120 and 240 or p_deck_level % 10 <> 0 or p_collab not between 0 and 9999 then
      raise exception 'デキレとコラボ数を選び直してください' using errcode = '22023';
    end if;
    if (r.min_deck_level is not null and p_deck_level < r.min_deck_level)
       or (r.min_collab is not null and p_collab < r.min_collab) then
      raise exception 'デキレ・コラボ数の条件を満たしていないため、申し込めません' using errcode = '22023';
    end if;
  end if;

  v_status := case when r.join_mode = 'instant' then 'approved' else 'pending' end;

  select * into v_existing from public.participations
  where recruitment_id = r.id and user_id = v_uid for update;

  if found then
    if v_existing.status in ('pending', 'approved') then
      return v_existing.id;
    elsif v_existing.status = 'rejected' then
      raise exception '募集者に見送られた (外された) 募集には、もう一度参加できません' using errcode = '42501';
    end if;
    update public.participations
      set status = v_status,
          decided_at = case when v_status = 'approved' then now() end,
          src = coalesce(private.clean_src(p_src), src),
          deck_level = case when v_deck then p_deck_level end,
          collab = case when v_deck then p_collab end
      where id = v_existing.id returning id into v_id;
  else
    insert into public.participations (recruitment_id, user_id, status, src, decided_at, deck_level, collab)
    values (r.id, v_uid, v_status, private.clean_src(p_src), case when v_status = 'approved' then now() end,
            case when v_deck then p_deck_level end, case when v_deck then p_collab end)
    returning id into v_id;
  end if;

  if v_status = 'approved' then
    v_count := r.approved_count + 1;
    update public.recruitments set
      approved_count = v_count,
      status = case when v_count >= capacity - 1 then 'full' else status end,
      filled_at = case when v_count >= capacity - 1 then now() else filled_at end
    where id = r.id;
    perform private.notify(r.owner_id, 'joined', r.id);
  else
    perform private.notify(r.owner_id, 'join_request', r.id);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.request_join(uuid, text, int, int) from public, anon;
grant execute on function public.request_join(uuid, text, int, int) to authenticated;

-- 募集者の「続ける」: 確認を消し、ここから55分後にまた確認する
create or replace function public.keep_recruitment(p_recruitment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  update public.recruitments set close_check_at = null, alive_at = now() where id = r.id;
  delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
end;
$$;
revoke execute on function public.keep_recruitment(uuid) from public, anon;
grant execute on function public.keep_recruitment(uuid) to authenticated;

-- 2固定中の切り替え (バトルアリーナ・フリーバトルの3人募集で、参加者が1人以上)
create or replace function public.set_duo_playing(p_recruitment_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  r public.recruitments;
begin
  select * into r from public.recruitments where id = p_recruitment_id for update;
  if not found or r.owner_id <> v_uid then
    raise exception '募集者のみ操作できます' using errcode = '42501';
  end if;
  if r.status not in ('open', 'full') or r.ends_at <= now() then
    raise exception 'この募集は終了しています' using errcode = '22023';
  end if;
  if p_on and (r.purpose not in ('rank', 'enjoy') or r.capacity <> 3 or r.approved_count < 1) then
    raise exception '2固定中にできるのは、参加者がいるバトルアリーナ・フリーバトルの3人募集だけです' using errcode = '22023';
  end if;
  update public.recruitments
    set duo_playing = coalesce(p_on, false),
        duo_ok = duo_ok or coalesce(p_on, false),
        close_check_at = null,
        alive_at = now()
    where id = r.id;
  delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
end;
$$;
revoke execute on function public.set_duo_playing(uuid, boolean) from public, anon;
grant execute on function public.set_duo_playing(uuid, boolean) to authenticated;

create or replace function private.tick_recruitments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  -- 予定時刻の知らせ (募集者と参加確定の方)
  for r in
    update public.recruitments set start_notified_at = now()
    where start_notified_at is null and starts_at <= now()
      and status in ('open', 'full') and hidden_at is null and ends_at > now()
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'starting', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;

  -- 2固定中: 参加者がいなくなったら戻す。終了が近づいたら30分延ばす (開始から6時間まで)
  update public.recruitments set duo_playing = false
    where duo_playing and approved_count = 0;
  update public.recruitments
    set ends_at = least(ends_at + interval '30 minutes', starts_at + interval '6 hours')
    where duo_playing and status in ('open', 'full') and hidden_at is null
      and ends_at > now() and ends_at <= now() + interval '10 minutes'
      and ends_at < starts_at + interval '6 hours';

  -- 55分たってもそろわない募集は、募集者に続けるか確かめる
  for r in
    update public.recruitments set close_check_at = now()
    where status = 'open' and hidden_at is null and not duo_playing and close_check_at is null
      and coalesce(alive_at, starts_at) + interval '55 minutes' <= now() and ends_at > now()
    returning id, owner_id
  loop
    insert into public.notifications (user_id, kind, recruitment_id) values (r.owner_id, 'close_check', r.id);
    n := n + 1;
  end loop;

  -- 確かめてから5分たっても操作がなければ取り消す (その間に満員・2固定中になったものは除く)
  for r in
    update public.recruitments set status = 'cancelled', cancelled_at = now()
    where status = 'open' and hidden_at is null and not duo_playing
      and close_check_at is not null and close_check_at + interval '5 minutes' <= now()
    returning id, owner_id
  loop
    delete from public.notifications where recruitment_id = r.id and kind = 'close_check';
    insert into public.notifications (user_id, kind, recruitment_id)
    select u, 'auto_closed', r.id from (
      select r.owner_id as u
      union
      select pa.user_id from public.participations pa where pa.recruitment_id = r.id and pa.status = 'approved'
    ) x;
    n := n + 1;
  end loop;
  return n;
end;
$$;

