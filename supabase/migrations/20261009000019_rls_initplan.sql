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
