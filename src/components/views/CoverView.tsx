import Link from '@/components/Link';
import { PurposeMark } from '@/components/Tags';
import { EnterListLink } from '@/components/EnterListLink';
import { PURPOSE_LABELS } from '@/lib/constants';
import { formatJstTime } from '@/lib/time';
import type { Recruitment } from '@/lib/types';
import { leftLabel } from '@/lib/capacity';

/**
 * 表紙 (未登録の方が初めて開いたとき)。受付中の数と次の募集を少し見せ、一覧・プロフィール作成・ログインへ。
 * 「募集を見る」を押すと Cookie を付けて一覧へ (次からは表紙を出さない)。
 */
export function CoverView({ items, now, loadError }: { items: Recruitment[]; now: Date; loadError?: boolean }) {
  const open = items.filter((r) => new Date(r.ends_at) > now);
  const next = open.slice(0, 3);
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 pt-0 lg:max-w-3xl lg:pt-8" aria-labelledby="cover-title">
      {/* JOIN と COMPASS の段違い。JOIN は左から、COMPASS は右から入って止まり、朱のひし形が押される。
          そのあとは JOIN と COMPASS が交互に跳ね続け、後ろで目的の刻印が横に流れる */}
      <div className="relative">
        <div aria-hidden className="cover-flow pointer-events-none absolute inset-x-[-1rem] top-1/2 lg:[mask-image:linear-gradient(to_right,transparent,#000_15%,#000_85%,transparent)] -translate-y-1/2 select-none">
          {[0, 1].map((row) => (
            <div key={row} className={`cover-flow-row ${row ? 'cover-flow-rev' : ''}`}>
              {Array.from({ length: 2 }, (_, k) => (
                <span key={k}>■ ● ▲ ◆ ★ ■ ● ▲ ◆ ★ ■ ● ▲ ◆ ★ </span>
              ))}
            </div>
          ))}
        </div>
        {/* サイト名と同じ JOIN◆COMPASS。ひし形は JOIN の後ろに押され、COMPASS は右に寄せる */}
        <h1 id="cover-title" className="type-poster relative flex flex-col overflow-x-clip text-[clamp(56px,min(25vw,12svh),190px)] uppercase lg:text-[clamp(110px,18svh,190px)]">
          <span className="cover-in-l self-start">
            <span className="cover-bob inline-flex items-center">
              Join
              <span aria-hidden className="cover-dot ml-[0.14em] inline-block size-[0.42em] rotate-45 bg-signal" />
            </span>
          </span>
          <span className="sr-only"> </span>
          <span className="cover-in-r -mt-[0.02em] self-end">
            <span className="cover-bob cover-bob-2 inline-block">Compass</span>
          </span>
        </h1>
      </div>

      <p className="flex items-baseline gap-2 border-y-2 border-ink py-2" aria-live="polite">
        <span className="type-time text-[44px]">{loadError ? '―' : String(open.length).padStart(2, '0')}</span>
        <span className="text-sm font-bold">件の募集が受付中</span>
      </p>

      {next.length > 0 && (
        <ul className="-mt-4">
          {next.map((r, i) => (
            <li key={r.id} className={`grid grid-cols-[64px_minmax(0,1fr)] items-baseline border-b border-ink/20 py-2.5 ${i === 2 ? 'opacity-40 [@media(max-height:700px)]:hidden' : ''}`}>
              <span className="type-time text-[22px]">{new Date(r.starts_at) <= now ? 'NOW' : formatJstTime(r.starts_at)}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <PurposeMark purpose={r.purpose} />
                <span className="truncate">{PURPOSE_LABELS[r.purpose]}</span>
                <span className="ml-auto shrink-0 font-mono text-[13px] font-black">
                  {leftLabel(r.capacity, r.approved_count)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <EnterListLink className="btn-signal btn-lg">募集を見る</EnterListLink>
        <Link href="/me" className="btn-outline btn-lg">
          プロフィールを作成
        </Link>
      </div>
      <Link href="/transfer" className="-mt-3 inline-flex min-h-11 items-center self-start text-sm font-bold underline decoration-2 underline-offset-4">
        以前から使っていた方はログイン
      </Link>
    </section>
  );
}
