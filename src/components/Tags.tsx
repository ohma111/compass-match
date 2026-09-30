import { MOOD_TAG_LABELS, PURPOSE_LABELS, RANK_LABELS, RECRUIT_STATUS_LABELS, RECRUIT_VC_LABELS } from '@/lib/constants';
import type { MoodTag, Purpose, RankBand, RecruitStatus, RecruitVc } from '@/lib/constants';

export function PurposeChip({ purpose }: { purpose: Purpose }) {
  return <span className="chip-brand">{PURPOSE_LABELS[purpose]}</span>;
}

export function MoodTags({ tags }: { tags: MoodTag[] }) {
  if (!tags?.length) return null;
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="chip">#{MOOD_TAG_LABELS[t] ?? t}</span>
      ))}
    </>
  );
}

export function StatusBadge({ status }: { status: RecruitStatus }) {
  const cls =
    status === 'open'
      ? 'bg-ok/15 text-ok'
      : status === 'full'
        ? 'bg-warn/15 text-warn'
        : 'bg-line text-muted';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{RECRUIT_STATUS_LABELS[status]}</span>;
}

export function RankText({ rank }: { rank: RankBand | null }) {
  return <>{rank ? RANK_LABELS[rank] : '指定なし'}</>;
}

export function VcText({ vc }: { vc: RecruitVc }) {
  return <>{RECRUIT_VC_LABELS[vc]}</>;
}
