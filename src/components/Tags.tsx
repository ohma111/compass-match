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

/** 目的バッジ (目的ごとに色分け) */
export function PurposeBadge({ purpose, size = 'sm' }: { purpose: Purpose; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`tone-${purpose} inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--tone)_45%,transparent)] bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] font-extrabold text-[var(--tone)] ${
        size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span className="size-1.5 rounded-full bg-[var(--tone)] shadow-[0_0_8px_var(--tone)]" aria-hidden />
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
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${mode === 'instant' ? 'text-brand' : 'text-muted'}`}>
      <Icon className="size-3.5" aria-hidden />
      {JOIN_MODE_LABELS[mode]}
    </span>
  );
}

const VC_ICON = { on: Mic, any: Headphones, off: MicOff } as const;

export function VcBadge({ vc, withLabel = false }: { vc: RecruitVc; withLabel?: boolean }) {
  const Icon = VC_ICON[vc];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={RECRUIT_VC_LABELS[vc]}>
      <Icon className="size-3.5" aria-hidden />
      {withLabel ? RECRUIT_VC_LABELS[vc] : <span className="sr-only">{RECRUIT_VC_LABELS[vc]}</span>}
    </span>
  );
}
