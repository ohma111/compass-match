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
