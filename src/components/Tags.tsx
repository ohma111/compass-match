import { Headphones, Hand, Mic, MicOff, Zap } from 'lucide-react';
import {
  JOIN_MODE_LABELS,
  MOOD_TAG_LABELS,
  PLAY_ROLE_LABELS,
  PURPOSE_LABELS,
  RECRUIT_VC_LABELS,
  type JoinMode,
  type MoodTag,
  type Purpose,
  type RecruitVc,
} from '@/lib/constants';
import type { Recruitment } from '@/lib/types';
import { RoleIcon } from './RoleIcon';

/** 目的の刻印 (色を使わず形で分ける: バトルアリーナ■ フリーバトル● 大会練習▲ カスタム◆ チャレンジバトル★) */
export function PurposeMark({ purpose, className = 'size-2.5' }: { purpose: Purpose; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`${className} shrink-0`} fill="currentColor" aria-hidden>
      {purpose === 'rank' && <rect x="0.5" y="0.5" width="9" height="9" />}
      {purpose === 'enjoy' && <circle cx="5" cy="5" r="4.6" />}
      {purpose === 'tournament' && <path d="M5 0.3 9.8 9.5H0.2Z" />}
      {purpose === 'custom' && <path d="M5 0 10 5 5 10 0 5Z" />}
      {purpose === 'challenge' && <path d="M5 0 6.2 3.6H10L6.9 5.8 8.1 9.5 5 7.2 1.9 9.5 3.1 5.8 0 3.6H3.8Z" />}
    </svg>
  );
}

/** 目的 (刻印 + 文字) */
export function PurposeBadge({ purpose, size = 'sm' }: { purpose: Purpose; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold text-ink ${size === 'md' ? 'text-sm' : 'text-[13px]'}`}>
      <PurposeMark purpose={purpose} className={size === 'md' ? 'size-3' : 'size-2.5'} />
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

/** v15: 2固定でも可・ほしいロール (一覧の札と詳細で同じもの) */
export function DuoAndRoles({ r }: { r: Pick<Recruitment, 'duo_ok' | 'wanted_roles'> }) {
  return (
    <>
      {r.duo_ok && <span className="shrink-0 font-black text-ink">2固定OK</span>}
      {r.wanted_roles && r.wanted_roles.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-ink" aria-label={`ほしいロール: ${r.wanted_roles.map((x) => PLAY_ROLE_LABELS[x]).join('・')}`}>
          求
          {r.wanted_roles.map((x) => (
            <RoleIcon key={x} role={x} className="size-3.5" />
          ))}
        </span>
      )}
    </>
  );
}

/** v15: バトルアリーナの承認制の、募集者のデキレ・コラボ数と参加の条件 */
export function DeckInfo({ r, className = '' }: { r: Pick<Recruitment, 'owner_deck_level' | 'owner_collab' | 'min_deck_level' | 'min_collab'>; className?: string }) {
  if (r.owner_deck_level == null) return null;
  const cond = [r.min_deck_level != null ? `デキレ${r.min_deck_level}↑` : null, r.min_collab != null ? `コラボ${r.min_collab}↑` : null].filter(Boolean);
  return (
    <p className={`flex flex-wrap gap-x-3 font-bold ${className}`}>
      <span>
        募集者 デキレ{r.owner_deck_level}・コラボ{r.owner_collab}
      </span>
      {cond.length > 0 && <span className="text-ink">条件 {cond.join('・')}</span>}
    </p>
  );
}
