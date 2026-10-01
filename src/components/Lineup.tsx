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
  // 名前が見えない参加者も、埋まった席は同じ色 (黒は募集者だけ)
  anon: 'bg-ally text-white',
  empty: 'hatch text-slate',
};

export function Lineup({
  seats,
  size = 'sm',
  label,
  joinSeat,
}: {
  seats: Seat[];
  size?: 'sm' | 'lg';
  /**
   * 空き席を「参加ボタン」にする (募集詳細のロビー)。最初の空き席だけが押せる。
   * キーボード・読み上げでも使えるよう button にする。文字のボタンも別に残す。
   */
  joinSeat?: { onJoin: () => void; label: string; pending?: boolean } | null;
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
            <span className="type-heavy [transform:skewX(calc(var(--seat-skew)*-1))] text-[16px] leading-none">
              {s.kind === 'empty' || s.kind === 'anon' ? '' : initialOf(s.name)}
            </span>
          </span>
        ))}
      </div>
    );
  }

  const cols = seats.length <= 3 ? seats.length : 3;
  const firstEmpty = seats.findIndex((x) => x.kind === 'empty');
  const joinable = (i: number) => Boolean(joinSeat) && i === firstEmpty;
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
              className={`relative flex h-40 flex-col justify-end overflow-hidden [transform:skewX(var(--seat-skew))] sm:h-48 ${
                joinable(i) ? 'seat-open bg-ally text-white' : SEAT_BG[s.kind]
              } ${
                s.you ? 'outline-4 outline-offset-2 outline-signal' : ''
              } ${s.enter ? 'seat-enter' : ''}`}
            >
              <div className="flex h-full flex-col justify-between px-3.5 pt-3 pb-3 [transform:skewX(calc(var(--seat-skew)*-1))] sm:px-5">
                <div className="flex items-center justify-between text-xs font-bold">
                  {s.kind === 'owner' && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-white/85">
                      <Crown className="size-3.5" aria-label="募集者" role="img" />
                      {!s.you && '募集者'}
                    </span>
                  )}
                  {s.you && <span className="bg-signal px-1.5 leading-5 whitespace-nowrap text-white">あなた</span>}
                </div>
                {s.kind === 'empty' ? (
                  joinable(i) ? (
                    <div className="text-white">
                      <p className="font-display text-[44px] leading-none sm:text-[56px]" aria-hidden>+</p>
                      <p className="mt-2 text-[13px] leading-snug font-bold">{joinSeat!.pending ? '参加しています…' : joinSeat!.label}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-display text-[44px] leading-none text-slate/40 sm:text-[56px]" aria-hidden>?</p>
                      <p className="mt-2 inline-block bg-sheet px-1.5 text-[13px] font-bold text-ink-2">空き</p>
                    </div>
                  )
                ) : s.kind === 'anon' ? (
                  <div>
                    <p className="text-[13px] font-bold">参加者</p>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="font-display text-[44px] leading-none sm:text-[56px]" aria-hidden>{initialOf(s.name)}</p>
                    <p className="mt-2 truncate text-[13px] font-bold sm:text-sm">{s.name}</p>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-white/90">
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
              {joinable(i) ? (
                <button
                  type="button"
                  onClick={joinSeat!.onJoin}
                  disabled={joinSeat!.pending}
                  className="block w-full text-left focus-visible:outline-offset-4 disabled:cursor-wait"
                  aria-label={`空いている席に入る: ${joinSeat!.label}`}
                >
                  {body}
                </button>
              ) : s.href ? (
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

    </div>
  );
}
