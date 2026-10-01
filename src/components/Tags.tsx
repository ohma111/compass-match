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

/** 雰囲気タグ。max を指定すると、それ以上は「+N」にまとめる (読み上げでは全部読む) */
export function MoodTags({ tags, max }: { tags: MoodTag[]; max?: number }) {
  if (!tags?.length) return null;
  const shown = max === undefined ? tags : tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <>
      {shown.map((t) => (
        <span key={t} className="chip shrink-0">#{MOOD_TAG_LABELS[t] ?? t}</span>
      ))}
      {rest > 0 && (
        <span className="chip shrink-0" aria-label={tags.slice(shown.length).map((t) => `#${MOOD_TAG_LABELS[t] ?? t}`).join(' ')}>
          +{rest}
        </span>
      )}
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

/** VC の有無。compact ではスマホのときアイコンだけ (文字は読み上げ用に残す) */
export function VcBadge({ vc, compact = false }: { vc: RecruitVc; compact?: boolean }) {
  const Icon = VC_ICON[vc];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate" title={RECRUIT_VC_LABELS[vc]}>
      <Icon className="size-4" aria-hidden />
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{RECRUIT_VC_LABELS[vc]}</span>
    </span>
  );
}
