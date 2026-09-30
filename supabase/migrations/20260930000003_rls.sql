-- =====================================================================
-- RLS ポリシー
-- 方針: 全テーブルRLS有効。書き込みは原則 security definer RPC 経由のみ。
--       クライアントから直接 insert/update/delete できる経路は最小限。
-- =====================================================================

alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.profile_contacts    enable row level security;
alter table public.user_roles          enable row level security;
alter table public.recruitments        enable row level security;
alter table public.recruitment_secrets enable row level security;
alter table public.participations      enable row level security;
alter table public.messages            enable row level security;
alter table public.blocks              enable row level security;
alter table public.reports             enable row level security;
alter table public.feedback            enable row level security;
alter table public.notifications       enable row level security;
alter table public.presence_now        enable row level security;

-- テーブル権限: まず全部剥がしてから必要なものだけ付与する
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- app_settings: 管理者のみ参照
-- ---------------------------------------------------------------------
grant select on public.app_settings to authenticated;
create policy app_settings_admin_select on public.app_settings
  for select to authenticated using (private.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- profiles: 公開プロフィール。流入元(signup_src)は列権限で隠す。
-- 停止・BAN・通報非表示のユーザーは本人と管理者以外には見えない。
-- ---------------------------------------------------------------------
grant select (
  id, display_name, rank_band, play_roles, characters, purposes, vc, tags, bio,
  terms_agreed_at, terms_version, hidden_at, suspended_at, banned_at, created_at, updated_at
) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or private.is_admin(auth.uid())
    or (banned_at is null and suspended_at is null and hidden_at is null)
  );

-- 未ログインの閲覧者: 募集一覧の募集者名表示に必要な最小限の列のみ
grant select (id, display_name, rank_band) on public.profiles to anon;
create policy profiles_select_anon on public.profiles
  for select to anon
  using (banned_at is null and suspended_at is null and hidden_at is null);

-- ---------------------------------------------------------------------
-- profile_contacts: 本人のみ。他人の連絡先は get_member_contacts() でのみ取得可能。
-- ---------------------------------------------------------------------
grant select on public.profile_contacts to authenticated;
create policy contacts_select_own on public.profile_contacts
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- user_roles: 自分の行のみ
-- ---------------------------------------------------------------------
grant select on public.user_roles to authenticated;
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- recruitments: 未ログインでも一覧は閲覧可 (外部からの流入のため)。
-- ブロック関係にある相手の募集は見えない。通報で非表示になった募集は
-- 募集者・承認済み参加者・管理者のみ見える。
-- ---------------------------------------------------------------------
grant select on public.recruitments to anon, authenticated;

create policy recruitments_select_anon on public.recruitments
  for select to anon
  using (hidden_at is null and private.is_active_user(owner_id));

create policy recruitments_select_auth on public.recruitments
  for select to authenticated
  using (
    owner_id = auth.uid()
    or private.is_admin(auth.uid())
    or private.is_member(id, auth.uid())
    or (
      hidden_at is null
      and private.is_active_user(owner_id)
      and not private.is_blocked_between(auth.uid(), owner_id)
    )
  );

-- recruitment_secrets: ポリシーなし = 直接参照不可。get_room_code() でのみ取得。
-- (権限も付与しない)

-- ---------------------------------------------------------------------
-- participations
--   本人の申請 / 自分の募集への申請 / 見える募集の「承認済み」参加者
-- ---------------------------------------------------------------------
grant select on public.participations to authenticated;
create policy participations_select on public.participations
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_owner(recruitment_id, auth.uid())
    or private.is_admin(auth.uid())
    or (
      status = 'approved'
      and exists (select 1 from public.recruitments r where r.id = recruitment_id)
    )
  );

-- ---------------------------------------------------------------------
-- messages: 募集者と承認済み参加者のみ。保持期間を過ぎたものは見えない。
-- 自分がブロックした相手のメッセージは表示しない。
-- ---------------------------------------------------------------------
grant select on public.messages to authenticated;
create policy messages_select on public.messages
  for select to authenticated
  using (
    private.is_admin(auth.uid())
    or (
      private.is_member(recruitment_id, auth.uid())
      and private.chat_available(recruitment_id)
      and hidden_at is null
      and not exists (
        select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = messages.user_id
      )
    )
  );

-- ---------------------------------------------------------------------
-- blocks: 自分がしたブロックのみ参照
-- ---------------------------------------------------------------------
grant select on public.blocks to authenticated;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------
-- reports: 自分の通報 / 管理者は全件
-- ---------------------------------------------------------------------
grant select on public.reports to authenticated;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- feedback: 自分の送信分 / 管理者は全件
-- ---------------------------------------------------------------------
grant select on public.feedback to authenticated;
create policy feedback_select on public.feedback
  for select to authenticated
  using (user_id = auth.uid() or private.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- notifications: 自分宛てのみ。既読(read_at)の更新と削除だけ直接許可。
-- ---------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- presence_now: 有効期限内・利用可能・ブロック関係なしのみ
-- ---------------------------------------------------------------------
grant select on public.presence_now to authenticated;
create policy presence_select on public.presence_now
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and private.is_active_user(user_id)
      and not private.is_blocked_between(auth.uid(), user_id)
    )
  );

-- ---------------------------------------------------------------------
-- Realtime: チャットと通知の変更を配信 (RLSが適用される)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
