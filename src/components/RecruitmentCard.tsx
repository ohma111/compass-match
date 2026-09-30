import Link from 'next/link';
import type { Recruitment } from '@/lib/types';
import { effectiveStatus, seatLabel } from '@/lib/capacity';
import { formatJstRange, relativeStart } from '@/lib/time';
import { RANK_LABELS, RECRUIT_VC_LABELS } from '@/lib/constants';
import { MoodTags, PurposeChip, StatusBadge } from './Tags';

export function RecruitmentCard({ r, now = new Date() }: { r: Recruitment; now?: Date }) {
  const status = effectiveStatus(r.status, r.ends_at, now);
  return (
    <Link href={`/recruitments/${r.id}`} className="card block space-y-2 active:opacity-80">
      <div className="flex items-center gap-2">
        <PurposeChip purpose={r.purpose} />
        <StatusBadge status={status} />
        <span className="ml-auto text-xs font-bold text-muted">{relativeStart(r.starts_at, r.ends_at, now)}</span>
      </div>
      <h3 className="text-base font-bold leading-snug">{r.title}</h3>
      <p className="text-sm">{formatJstRange(r.starts_at, r.ends_at)}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="font-bold text-fg">{seatLabel(r.capacity, r.approved_count)}</span>
        <span>・{RECRUIT_VC_LABELS[r.vc]}</span>
        {r.min_rank && <span>・{RANK_LABELS[r.min_rank]}以上</span>}
        {r.owner && <span>・{r.owner.display_name}</span>}
      </div>
      {r.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <MoodTags tags={r.tags} />
        </div>
      )}
    </Link>
  );
}
