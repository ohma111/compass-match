-- v14 (有料版の土台): 課金状態 (entitlements) をサーバー側で持つ。決済サービスとはまだつながない。
-- 1) public.entitlements: 1人1行。利用者は自分の行を読めるだけ (書けるのは管理者の RPC と、将来の決済の Webhook = service_role)
-- 2) private.has_plus(uid): 有効かどうかの判定は DB のこの関数だけで行う (画面の表示もこの結果を使う)
-- 3) viewer_header に plus / plus_until を足す (問い合わせの回数は増やさない)
-- 4) 有効な Plus の方は「60日操作なしの自動削除」から外す (払っているのに消えるのを防ぐ)
-- 5) 管理者が手動で付ける・外す RPC (試験・お詫び・先行で使ってもらう方向け)。決済で付いた行は手動で変えない
-- 6) admin_list_users に plus_until を足す
-- 2回流しても壊れない。画面は環境変数 NEXT_PUBLIC_FEATURE_PLUS が ON のときだけ Plus を出す

-- 1) ---------------------------------------------------------------------
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'plus' check (plan in ('plus')),
  -- active: 支払い済み / trialing: 無料期間 / past_due: 支払い失敗 (猶予中) / canceled: 解約済み / manual: 管理者が付けた
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'manual')),
  -- この日時まで有効 (null は期限なし。manual でだけ使う)
  current_period_end timestamptz,
  -- 期間の終わりで解約する予約 (決済サービスの cancel_at_period_end)
  cancel_at_period_end boolean not null default false,
  provider text not null default 'manual' check (provider in ('manual', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

-- 2) ---------------------------------------------------------------------
-- 支払いが失敗しても、決済サービスが再請求している間 (past_due) は期間の終わりから3日は有効のままにする
create or replace function private.has_plus(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_uid
      and (
        (e.status in ('active', 'trialing', 'manual') and (e.current_period_end is null or e.current_period_end > now()))
        or (e.status = 'past_due' and e.current_period_end > now() - interval '3 days')
      )
  );
$$;
revoke execute on function private.has_plus(uuid) from public, anon, authenticated;

-- 3) ---------------------------------------------------------------------
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
    ), false),
    -- private.has_plus と同じ条件 (viewer_header は security invoker なので private の関数は呼ばず、RLS で読める本人の行を見る)
    'plus', exists (
      select 1 from public.entitlements e
      where e.user_id = (select auth.uid())
        and (
          (e.status in ('active', 'trialing', 'manual') and (e.current_period_end is null or e.current_period_end > now()))
          or (e.status = 'past_due' and e.current_period_end > now() - interval '3 days')
        )
    ),
    'plus_until', (select current_period_end from public.entitlements where user_id = (select auth.uid()))
  );
$$;
revoke execute on function public.viewer_header() from public, anon;
grant execute on function public.viewer_header() to authenticated;

-- 4) ---------------------------------------------------------------------
create or replace function private.inactive_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.last_seen_at < now() - make_interval(days => private.setting_int('inactive_delete_days', 60))
    and not private.is_protected(p.id)
    and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'admin')
    and not exists (select 1 from public.recruitments r where r.owner_id = p.id and r.status in ('open', 'full') and r.ends_at > now())
    and not private.has_plus(p.id);
$$;

-- 5) ---------------------------------------------------------------------
-- p_until が null なら外す。決済 (provider = 'stripe') で付いている行は変えない
create or replace function public.admin_set_plus(p_user uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if exists (select 1 from public.entitlements where user_id = p_user and provider <> 'manual') then
    raise exception '決済で登録された Plus は、決済サービスの側で変更してください';
  end if;
  if p_until is null then
    delete from public.entitlements where user_id = p_user;
    return;
  end if;
  if p_until <= now() then
    raise exception '期限は今より後にしてください';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'ユーザーが見つかりません';
  end if;
  insert into public.entitlements (user_id, status, current_period_end, provider, note)
    values (p_user, 'manual', p_until, 'manual', '管理画面')
  on conflict (user_id) do update
    set status = 'manual', current_period_end = excluded.current_period_end, updated_at = now();
end;
$$;
revoke execute on function public.admin_set_plus(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_plus(uuid, timestamptz) to authenticated;

-- 6) ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_q text default '', p_page int default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_page int := greatest(coalesce(p_page, 1), 1);
  v jsonb;
begin
  perform private.require_admin();
  with base as (
    select p.id, p.display_name, p.rank_band, p.avatar, p.banned_at, p.hidden_at, p.created_at, p.last_seen_at,
           coalesce(u.is_anonymous, false) as is_anonymous,
           exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin') as is_admin,
           case when private.has_plus(p.id) then (select e.current_period_end from public.entitlements e where e.user_id = p.id) end as plus_until,
           private.has_plus(p.id) as plus,
           (select e.provider from public.entitlements e where e.user_id = p.id) as plus_provider
    from public.profiles p
    left join auth.users u on u.id = p.id
    where v_q = ''
       or p.id::text = v_q
       or p.display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'page', v_page,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select * from base order by created_at desc offset (v_page - 1) * 10 limit 10) x
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.admin_list_users(text, int) from public, anon;
grant execute on function public.admin_list_users(text, int) to authenticated;
