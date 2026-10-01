import Link from 'next/link';
import { Crown } from 'lucide-react';
import { RANK_LABELS, type PlayRole, type RankBand } from '@/lib/constants';
import { RoleIcon } from './RoleIcon';

/**
 * 試合前のチーム編成のように、募集の席を斜めの枠で並べる。
 * このサイトの見た目の軸: 一覧 (sm)・募集詳細 (lg)・募集作成と登録のプレビューで同じ形を使う。
 */
export interface Seat {
  kind: 'owner' | 'member' | 'anon' | 'empty';
  name?: string;
  rank?: RankBand | null;
  roles?: PlayRole[];
  you?: boolean;
  href?: string;
  /** 参加が確定した直後: 滑り込む動き (prefers-reduced-motion では動かない) */
  enter?: boolean;
}

function initialOf(name?: string): string {
  return Array.from((name ?? '').trim())[0] ?? '?';
}

const SEAT_BG: Record<Seat['kind'], string> = {
  owner: 'bg-ink text-white',
  member: 'bg-ally text-white',
  anon: 'bg-ink-2 text-white/90',
  empty: 'hatch text-slate',
};

export function Lineup({
  seats,
  size = 'sm',
  stamp,
  label,
}: {
  seats: Seat[];
  size?: 'sm' | 'lg';
  /** 席の上に押す判 (「参加確定」「満員」) */
  stamp?: string | null;
  /** 読み上げ用の説明 (例: 「3人中2人・あと1人」) */
  label: string;
}) {
  if (size === 'sm') {
    return (
      <div className="flex gap-1.5 px-1.5" role="img" aria-label={label}>
        {seats.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className={`flex h-9 min-w-0 flex-1 items-center justify-center [transform:skewX(var(--seat-skew))] ${SEAT_BG[s.kind]} ${
              s.you ? 'outline-3 outline-offset-1 outline-signal' : ''
            } ${s.enter ? 'seat-enter' : ''}`}
          >
            <span className="font-display [transform:skewX(calc(var(--seat-skew)*-1))] text-[15px] leading-none">
              {s.kind === 'empty' || s.kind === 'anon' ? '' : initialOf(s.name)}
            </span>
          </span>
        ))}
      </div>
    );
  }

  const cols = seats.length <= 3 ? seats.length : 3;
  return (
    <div className="relative">
      <ul
        className="grid gap-2.5 px-5 sm:gap-3 sm:px-7"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        aria-label={label}
      >
        {seats.map((s, i) => {
          const body = (
            <div
              className={`relative flex h-40 flex-col justify-end overflow-hidden [transform:skewX(var(--seat-skew))] sm:h-48 ${SEAT_BG[s.kind]} ${
                s.you ? 'outline-4 outline-offset-2 outline-signal' : ''
              } ${s.enter ? 'seat-enter' : ''}`}
            >
              <div className="flex h-full flex-col justify-between px-3.5 pt-3 pb-3 [transform:skewX(calc(var(--seat-skew)*-1))] sm:px-5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  {s.kind === 'owner' && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-white/85">
                      <Crown className="size-3.5" aria-label="募集者" role="img" />
                      {!s.you && '募集者'}
                    </span>
                  )}
                  {s.you && <span className="bg-signal px-1.5 leading-5 whitespace-nowrap text-white">あなた</span>}
                </div>
                {s.kind === 'empty' ? (
                  <div>
                    <p className="font-display text-[44px] leading-none text-line sm:text-[56px]" aria-hidden>?</p>
                    <p className="mt-2 text-[13px] font-bold">空き</p>
                  </div>
                ) : s.kind === 'anon' ? (
                  <div>
                    <p className="text-[13px] font-bold">参加者</p>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="font-display text-[44px] leading-none sm:text-[56px]" aria-hidden>{initialOf(s.name)}</p>
                    <p className="mt-2 truncate text-[13px] font-bold sm:text-sm">{s.name}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-white/80">
                      {s.rank && <span className="whitespace-nowrap">{RANK_LABELS[s.rank]}</span>}
                      {s.roles?.map((r) => <RoleIcon key={r} role={r} className="size-3.5" />)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
          return (
            <li key={i} className="min-w-0">
              {s.href ? (
                <Link href={s.href} className="block focus-visible:outline-offset-4">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
      {stamp && (
        <div className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2">
          <p
            className="lineup-stamp font-display border-4 border-signal bg-sheet px-4 py-0.5 text-[22px] whitespace-nowrap text-signal sm:text-[28px]"
            style={{ transform: 'rotate(-8deg)' }}
            role="status"
          >
            {stamp}
          </p>
        </div>
      )}
    </div>
  );
}
