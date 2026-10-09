import Link from 'next/link';
import { Crown, User } from 'lucide-react';
import { RANK_LABELS, RANK_SHORT, type Avatar, type PlayRole, type RankBand } from '@/lib/constants';
import { AvatarIcon } from './Avatar';
import { RoleIcon } from './RoleIcon';
import { Emblem } from './Emblem';

/**
 * 試合前のチーム編成のように、募集の席を斜めの枠で並べる。
 * 席の顔は「ロール(剣・銃・盾・足) + ランク」。ロール未登録の人は ID から作る模様。
 * 一覧 (sm)・募集詳細 (lg)・募集作成と登録のプレビューで同じ形を使う。
 */
export interface Seat {
  kind: 'owner' | 'member' | 'anon' | 'empty';
  /** 模様の元 (ユーザーID) */
  id?: string;
  name?: string;
  rank?: RankBand | null;
  roles?: PlayRole[];
  /** 選んだアイコン (あればロールより優先) */
  avatar?: Avatar | null;
  you?: boolean;
  href?: string;
  /** 参加が確定した直後: 滑り込む動き (prefers-reduced-motion では動かない) */
  enter?: boolean;
}

function fill(s: Seat): string {
  if (s.kind === 'empty') return 'hatch text-ink/70';
  if (s.kind === 'anon') return 'bg-ink-2 text-white';
  if (s.you) return 'bg-signal text-ink';
  if (s.kind === 'owner') return 'bg-ink text-white';
  return 'bg-ink-2 text-white';
}

/** 席の顔: 1つ目のロールのアイコン。ロールがなければ模様。どちらも出せなければ何も出さない */
function Face({ s, className }: { s: Seat; className: string }) {
  if (s.avatar) return <AvatarIcon avatar={s.avatar} className={className} />;
  const role = s.roles?.[0];
  if (role) return <RoleIcon role={role} className={className} />;
  if (s.id) return <Emblem seed={s.id} className={className} />;
  return null;
}

export function Lineup({
  seats,
  size = 'sm',
  label,
  joinSeat,
  tall = false,
}: {
  seats: Seat[];
  /** 募集詳細の主役として、PC で大きく出す */
  tall?: boolean;
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
    // 6人募集などで席が細くなるときは、ランクを省いてアイコンだけにする
    const narrow = seats.length > 4;
    return (
      <div className={narrow ? 'grid grid-cols-3 gap-1 px-1.5' : 'flex gap-1 px-1.5'} role="img" aria-label={label}>
        {seats.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className={`flex min-w-0 flex-1 items-center justify-center [transform:skewX(var(--seat-skew))] ${narrow ? 'h-[18px]' : 'h-10'} ${fill(s)} ${s.enter ? 'seat-enter' : ''}`}
          >
            <span className="flex items-center gap-0.5 [transform:skewX(calc(var(--seat-skew)*-1))]">
              {narrow ? (
                s.kind === 'owner' || s.kind === 'member' ? <Face s={s} className="size-3" /> : s.kind === 'anon' ? <User className="size-3" aria-hidden /> : null
              ) : s.kind === 'empty' ? (
                <span className="font-mono text-[15px] leading-none font-bold">+</span>
              ) : (
                <>
                  {s.kind === 'anon' ? <User className="size-3.5 shrink-0 sm:size-4" aria-hidden /> : <Face s={s} className="size-3.5 shrink-0 sm:size-4" />}
                  {s.rank && !narrow && <span className="font-mono text-[10px] leading-none font-bold tracking-[-0.04em] whitespace-nowrap sm:text-[11px]">{RANK_SHORT[s.rank]}</span>}
                </>
              )}
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
    <ul
      className={`grid gap-2.5 px-5 sm:gap-3 sm:px-7 ${tall ? 'lg:gap-5 lg:px-12' : ''}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-label={label}
    >
      {seats.map((s, i) => {
        const open = joinable(i);
        const body = (
          <div
            className={`relative flex h-44 flex-col overflow-hidden [transform:skewX(var(--seat-skew))] sm:h-52 ${tall ? 'lg:h-56' : ''} ${
              open ? 'seat-open bg-signal text-ink' : fill(s)
            } ${s.enter ? 'seat-enter' : ''}`}
          >
            <div className="flex h-full flex-col justify-between px-3.5 pt-3 pb-3 [transform:skewX(calc(var(--seat-skew)*-1))] sm:px-5">
              <div className={`flex items-center justify-between gap-1 pl-2 ${tall ? 'lg:pl-10' : ''}`}>
                <span className="type-tag opacity-70">{String(i + 1).padStart(2, '0')}</span>
                {s.kind === 'owner' && !s.you && <Crown className="size-4 opacity-80" aria-label="募集者" role="img" />}
                {s.you && <span className="type-tag bg-ink px-1.5 text-white">YOU</span>}
              </div>
              {s.kind === 'empty' ? (
                open ? (
                  <div>
                    <p className={`type-poster text-[56px] sm:text-[72px] ${tall ? 'lg:text-[112px]' : ''}`} aria-hidden>+</p>
                    <p className="mt-2 text-[13px] leading-snug font-bold">{joinSeat!.pending ? '参加しています…' : joinSeat!.label}</p>
                  </div>
                ) : (
                  <div>
                    <p className={`type-poster text-[56px] sm:text-[72px] ${tall ? 'lg:text-[112px]' : ''}`} aria-hidden>+</p>
                    <p className="mt-2 text-[13px] font-bold text-ink">空き</p>
                  </div>
                )
              ) : s.kind === 'anon' ? (
                <div>
                  <User className={`size-10 sm:size-12 ${tall ? 'lg:size-16' : ''}`} aria-hidden />
                  <p className="mt-2.5 text-[14px] font-black">参加者</p>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="flex items-end gap-1.5">
                    <Face s={s} className={`size-10 sm:size-12 ${tall ? 'lg:size-16' : ''}`} />
                    {s.roles && s.roles.length > 1 && (
                      <span className="flex gap-1 pb-0.5 opacity-75">
                        {s.roles.slice(1).map((r) => (
                          <RoleIcon key={r} role={r} className="size-4" />
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 truncate text-[14px] font-black sm:text-[15px]">{s.name}</p>
                  {s.rank && (
                    <p className="font-mono text-[12px] font-bold whitespace-nowrap opacity-85">
                      <span aria-hidden>{RANK_SHORT[s.rank]}</span>
                      <span className="sr-only">{RANK_LABELS[s.rank]}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
        return (
          <li key={i} className="min-w-0">
            {open ? (
              <button
                type="button"
                onClick={joinSeat!.onJoin}
                disabled={joinSeat!.pending}
                className="block w-full text-left focus-visible:outline-offset-4 disabled:cursor-wait"
                aria-label={`空いている枠から${joinSeat!.label}`}
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
  );
}

/** マイページ・プロフィールの大きな1席 (名前の頭文字の代わりに、ロールか模様) */
export function ProfileSeat({ id, roles, rank, avatar = null }: { id: string; roles: PlayRole[]; rank: RankBand | null; avatar?: Avatar | null }) {
  return (
    <div className="ml-3 flex h-28 w-22 shrink-0 flex-col justify-end bg-ink px-3 pb-3 text-white [transform:skewX(var(--seat-skew))]" aria-hidden>
      <div className="[transform:skewX(calc(var(--seat-skew)*-1))]">
        <Face s={{ kind: 'member', id, roles, avatar }} className="size-10" />
        {rank && <p className="mt-1.5 font-mono text-[12px] font-bold">{RANK_SHORT[rank]}</p>}
      </div>
    </div>
  );
}

/** 一覧の行に置く小さな1席 (いっしょに遊んだ人など) */
export function MiniSeat({ id, roles, avatar = null }: { id: string; roles: PlayRole[]; avatar?: Avatar | null }) {
  return (
    <span className="ml-1 flex h-10 w-8 shrink-0 items-center justify-center bg-ink text-white [transform:skewX(var(--seat-skew))]" aria-hidden>
      <span className="[transform:skewX(calc(var(--seat-skew)*-1))]">
        <Face s={{ kind: 'member', id, roles, avatar }} className="size-4" />
      </span>
    </span>
  );
}
