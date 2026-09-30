import Link from 'next/link';
import type { Recruitment } from '@/lib/types';
import { canRequestJoin, effectiveStatus, type JoinState } from '@/lib/capacity';
import { RANK_LABELS, RANK_MIN_LABELS } from '@/lib/constants';
import { JoinModeBadge, MoodTags, PurposeBadge, VcBadge } from './Tags';
import { SlotDots } from './SlotDots';
import { Countdown } from './Countdown';
import { Avatar } from './Avatar';
import { JoinButton, type AuthState } from './JoinButton';

export function RecruitmentCard({
  r,
  now,
  auth,
  viewerId,
  myState = 'none',
  showJoin = true,
}: {
  r: Recruitment;
  now: Date;
  auth: AuthState;
  viewerId?: string | null;
  myState?: JoinState;
  showJoin?: boolean;
}) {
  const status = effectiveStatus(r.status, r.ends_at, now);
  const isOwner = viewerId === r.owner_id;
  const join = canRequestJoin({
    status: r.status,
    endsAt: r.ends_at,
    capacity: r.capacity,
    approvedCount: r.approved_count,
    isOwner,
    myState,
    now,
  });
  const muted = status === 'ended' || status === 'cancelled';

  return (
    <article
      className={`tone-${r.purpose} relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface ${muted ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-[var(--tone)] shadow-[0_0_14px_var(--tone)]"
      />
      <Link href={`/recruitments/${r.id}`} className="block space-y-3 p-4 pl-5 pb-3 active:bg-surface-2/60">
        <div className="flex items-center justify-between gap-2">
          <PurposeBadge purpose={r.purpose} />
          <Countdown start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} />
        </div>
        <h3 className="text-[17px] leading-snug font-extrabold break-words">{r.title}</h3>
        <div className="flex items-center justify-between gap-3">
          <SlotDots capacity={r.capacity} approvedCount={r.approved_count} />
          <div className="flex items-center gap-3">
            <VcBadge vc={r.vc} />
            <JoinModeBadge mode={r.join_mode} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {r.owner && <Avatar name={r.owner.display_name} seed={r.owner_id} size="sm" />}
          <span className="min-w-0 truncate font-bold">{r.owner?.display_name ?? '―'}</span>
          {r.owner && <span className="shrink-0 text-xs text-muted">{RANK_LABELS[r.owner.rank_band]}</span>}
          {r.min_rank && (
            <span className="ml-auto shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-muted">
              条件 {RANK_MIN_LABELS[r.min_rank]}
            </span>
          )}
        </div>
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <MoodTags tags={r.tags} />
          </div>
        )}
      </Link>
      {showJoin && (
        <div className="px-4 pb-4 pl-5">
          <JoinButton
            recruitmentId={r.id}
            joinMode={r.join_mode}
            auth={auth}
            canJoin={join.ok}
            reason={join.reason}
            isOwner={isOwner}
            joined={myState === 'approved'}
          />
        </div>
      )}
    </article>
  );
}
