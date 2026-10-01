import { Headphones, Hand, Mic, MicOff, Zap } from 'lucide-react';
import {
  JOIN_MODE_LABELS,
  MOOD_TAG_LABELS,
  PURPOSE_LABELS,
  RECRUIT_VC_LABELS,
  type JoinMode,
  type MoodTag,
  type Purpose,
  type RecruitVc,
} from '@/lib/constants';

/** 目的 (色の付いた斜めの小さな札 + 文字) */
export function PurposeBadge({ purpose, size = 'sm' }: { purpose: Purpose; size?: 'sm' | 'md' }) {
  return (
    <span className={`tone-${purpose} inline-flex items-center gap-1.5 font-bold text-[var(--tone)] ${size === 'md' ? 'text-sm' : 'text-[13px]'}`}>
      <span aria-hidden className={`${size === 'md' ? 'h-4 w-2' : 'h-3.5 w-1.5'} [transform:skewX(var(--seat-skew))] bg-[var(--tone)]`} />
      {PURPOSE_LABELS[purpose]}
    </span>
  );
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

export function JoinModeBadge({ mode }: { mode: JoinMode }) {
  const Icon = mode === 'instant' ? Zap : Hand;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${mode === 'instant' ? 'text-ally' : 'text-slate'}`}>
      <Icon className="size-3.5" aria-hidden />
      {JOIN_MODE_LABELS[mode]}
    </span>
  );
}

const VC_ICON = { on: Mic, any: Headphones, off: MicOff } as const;

export function VcBadge({ vc }: { vc: RecruitVc }) {
  const Icon = VC_ICON[vc];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate">
      <Icon className="size-3.5" aria-hidden />
      {RECRUIT_VC_LABELS[vc]}
    </span>
  );
}
