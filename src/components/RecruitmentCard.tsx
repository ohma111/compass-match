import Link from 'next/link';
import type { Recruitment } from '@/lib/types';
import { canRequestJoin, effectiveStatus, remainingSlots, seatLabel, type JoinState } from '@/lib/capacity';
import { STANCE_LABELS, JOIN_MODE_LABELS, PURPOSE_LABELS, RANK_MIN_LABELS, RECRUIT_VC_LABELS, rankLabel } from '@/lib/constants';
import { seatsFor } from '@/lib/seats';
import { MoodTags, PurposeMark } from './Tags';
import { TimeRail } from './TimeRail';
import { Lineup } from './Lineup';
import { JoinButton, type AuthState } from './JoinButton';

/**
 * 時間割の1行。左に開始時刻、右に「目的・募集者・条件」の札、タイトル、席と参加ボタン。
 * まもなく・開催中の行は上の罫が朱になる。
 */
export function RecruitmentCard({
  r,
  now,
  auth,
  viewerId,
  myState = 'none',
  showJoin = true,
  repeatTime = false,
  index = 0,
  blockedHere = false,
}: {
  r: Recruitment;
  now: Date;
  auth: AuthState;
  viewerId?: string | null;
  myState?: JoinState;
  showJoin?: boolean;
  /** 直前の行と開始時刻が同じ (時刻を薄く出す) */
  repeatTime?: boolean;
  /** 一覧での順番 (出てくるときの時差) */
  index?: number;
  /** 自分がブロックしている人が参加している */
  blockedHere?: boolean;
  /** v4 までの「大きく見せる」指定。v5 では使わない */
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
  const seats = seatsFor(r, { viewerId });

  return (
    <article
      aria-labelledby={titleId}
      className={`row-in grid grid-cols-[64px_minmax(0,1fr)] border-t-2 border-ink lg:grid-cols-[132px_minmax(0,1fr)] ${muted ? 'opacity-55' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <Link href={`/recruitments/${r.id}`} tabIndex={-1} aria-hidden className="pt-3 lg:pt-5">
        <TimeRail start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} dim={repeatTime} />
      </Link>
      <div className="min-w-0 border-l border-ink/80 pb-4 pl-3 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end lg:gap-8 lg:pb-6 lg:pl-6">
        <Link href={`/recruitments/${r.id}`} className="group block min-w-0 pt-3 lg:pt-5">
          <p className="type-tag flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap text-slate">
            <span className="flex shrink-0 items-center gap-1.5 text-ink">
              <PurposeMark purpose={r.purpose} />
              {PURPOSE_LABELS[r.purpose]}
            </span>
            <span aria-hidden>/</span>
            <span className="truncate text-ink-2">
              {r.owner?.display_name ?? '―'}
              {r.owner && <span className="text-slate"> {rankLabel(r.owner.rank_band)}</span>}
            </span>
          </p>
          <h3
            id={titleId}
            className="mt-1.5 text-[17px] leading-snug font-black text-balance break-words [word-break:auto-phrase] decoration-signal decoration-2 underline-offset-4 group-hover:underline lg:text-[21px]"
          >
            {r.title}
          </h3>
          {/* 1行に収まらない札は次の行に回して隠す (途中で切れた札を見せない) */}
          <p className="mt-1.5 flex h-5 min-w-0 flex-wrap items-center gap-x-2.5 overflow-hidden text-[12px] leading-5 font-bold whitespace-nowrap text-slate">
            <span className="shrink-0 font-mono text-[13px] font-black text-ink">
              {Math.min(r.capacity, r.approved_count + 1)}/{r.capacity}
            </span>
            <span className={`shrink-0 px-1 font-black ${left > 0 ? 'bg-signal text-ink' : 'bg-ink text-white'}`}>{left > 0 ? `あと${left}人` : '満員'}</span>
            {r.stance && <span className="shrink-0 text-ink">{STANCE_LABELS[r.stance]}</span>}
            <span className="shrink-0">{JOIN_MODE_LABELS[r.join_mode]}</span>
            <span className="shrink-0">{RECRUIT_VC_LABELS[r.vc]}</span>
            {r.min_rank && <span className="shrink-0 text-ink-2">条件 {RANK_MIN_LABELS[r.min_rank]}</span>}
            <MoodTags tags={r.tags} max={1} />
          </p>
          {blockedHere && <p className="mt-1.5 text-[12px] font-bold text-signal-deep">ブロックしている方がいます</p>}
        </Link>
        <div className="mt-3 flex items-center gap-2.5 lg:mt-0 lg:flex-col lg:items-stretch lg:gap-2 lg:pt-5">
          <div className="min-w-0 flex-1">
            <Lineup seats={seats} label={seatLabel(r.capacity, r.approved_count)} />
          </div>
          {showJoin && (
            <div className="w-[7rem] shrink-0 lg:w-full">
              <JoinButton
                recruitmentId={r.id}
                joinMode={r.join_mode}
                auth={auth}
                canJoin={join.ok}
                reason={join.reason}
                isOwner={isOwner}
                joined={myState === 'approved'}
                warnBlocked={blockedHere}
                minRank={r.min_rank}
                vcOn={r.vc === 'on'}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
