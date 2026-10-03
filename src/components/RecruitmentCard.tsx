import Link from 'next/link';
import type { Recruitment } from '@/lib/types';
import { canRequestJoin, effectiveStatus, remainingSlots, seatLabel, type JoinState } from '@/lib/capacity';
import { RANK_LABELS, RANK_MIN_LABELS } from '@/lib/constants';
import { seatsFor } from '@/lib/seats';
import { JoinModeBadge, MoodTags, PurposeBadge, VcBadge } from './Tags';
import { Countdown } from './Countdown';
import { Lineup } from './Lineup';
import { JoinButton, type AuthState } from './JoinButton';

/** 一覧の募集。開始時刻を一番大きく、その下に席の並び、最後に参加ボタン */
export function RecruitmentCard({
  r,
  now,
  auth,
  viewerId,
  myState = 'none',
  showJoin = true,
  featured = false,
}: {
  r: Recruitment;
  now: Date;
  auth: AuthState;
  viewerId?: string | null;
  myState?: JoinState;
  showJoin?: boolean;
  /** 一覧の先頭で「まもなく始まる」募集を大きく見せる */
  featured?: boolean;
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
  const left = remainingSlots(r.capacity, r.approved_count);
  const titleId = `r-${r.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className={`tone-${r.purpose} sheet flex min-w-0 flex-col ${muted ? 'opacity-60' : ''} ${featured ? 'xl:col-span-2' : ''}`}
    >
      <span aria-hidden className="absolute top-0 left-0 h-1 w-[calc(100%-var(--cut))] bg-[var(--tone)]" />
      <Link
        href={`/recruitments/${r.id}`}
        className={`block flex-1 px-4 pt-4 pb-3 hover:bg-tint/60 focus-visible:outline-offset-[-3px] ${featured ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:gap-8 xl:px-6 xl:pt-6' : ''}`}
      >
       <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 pr-2">
          <Countdown start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} size={featured ? 'lg' : 'md'} />
          <PurposeBadge purpose={r.purpose} />
        </div>
        <h3 id={titleId} className={`mt-3 leading-snug font-black break-words ${featured ? 'text-[20px] xl:text-[24px]' : 'text-[17px]'}`}>
          {r.title}
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-slate">
          <span className="truncate font-bold text-ink-2">{r.owner?.display_name ?? '―'}</span>
          {r.owner && <span className="shrink-0">{RANK_LABELS[r.owner.rank_band]}</span>}
          {r.min_rank && <span className="ml-auto shrink-0 font-bold text-ink-2">条件 {RANK_MIN_LABELS[r.min_rank]}</span>}
        </p>
        {/* 1行に収める。入りきらないタグは「+N」にまとめる */}
        <div className="mt-3 flex items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <span className={`type-heavy shrink-0 text-[15px] ${left > 0 ? 'text-ink' : 'text-slate'}`}>{left > 0 ? `あと${left}人` : '満員'}</span>
          <JoinModeBadge mode={r.join_mode} />
          <VcBadge vc={r.vc} compact />
          <MoodTags tags={r.tags} max={1} />
        </div>
       </div>
        {featured && (
          <div className="hidden xl:block">
            <Lineup seats={seatsFor(r, { viewerId })} size="lg" label={seatLabel(r.capacity, r.approved_count)} />
          </div>
        )}
      </Link>
      {/* 席の並びと参加ボタンを1行に (スマホで1画面に2枚以上入るように) */}
      <div className={`flex items-center gap-3 px-4 pb-4 ${featured ? 'xl:px-6' : ''}`}>
        <div className={`min-w-0 flex-1 ${featured ? 'xl:hidden' : ''}`}>
          <Lineup seats={seatsFor(r, { viewerId })} label={seatLabel(r.capacity, r.approved_count)} />
        </div>
        {showJoin && (
          <div className={`w-[8.75rem] shrink-0 ${featured ? 'xl:ml-auto xl:w-56' : ''}`}>
            <JoinButton
              recruitmentId={r.id}
              joinMode={r.join_mode}
              auth={auth}
              canJoin={join.ok}
              reason={join.reason}
              isOwner={isOwner}
              joined={myState === 'approved'}
              compact
            />
          </div>
        )}
      </div>
    </article>
  );
}
