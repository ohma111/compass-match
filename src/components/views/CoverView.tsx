import Link from 'next/link';
import { PurposeMark } from '@/components/Tags';
import { EnterListLink } from '@/components/EnterListLink';
import { PURPOSE_LABELS } from '@/lib/constants';
import { formatJstTime } from '@/lib/time';
import type { Recruitment } from '@/lib/types';

/**
 * 表紙 (未登録の方が初めて開いたとき)。受付中の数と次の募集を少し見せ、一覧・プロフィール作成・ログインへ。
 * 「募集を見る」を押すと Cookie を付けて一覧へ (次からは表紙を出さない)。
 */
export function CoverView({ items, now, loadError }: { items: Recruitment[]; now: Date; loadError?: boolean }) {
  const open = items.filter((r) => new Date(r.ends_at) > now);
  const next = open.slice(0, 3);
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-7 pt-2 lg:max-w-3xl lg:pt-8" aria-labelledby="cover-title">
      <h1 id="cover-title" className="type-poster text-[clamp(76px,24vw,168px)] uppercase">
        Squad
        <br />
        up<span className="text-signal">.</span>
      </h1>

      <p className="flex items-baseline gap-2 border-y-2 border-ink py-2" aria-live="polite">
        <span className="type-time text-[44px]">{loadError ? '―' : String(open.length).padStart(2, '0')}</span>
        <span className="text-sm font-bold">件の募集が受付中</span>
      </p>

      {next.length > 0 && (
        <ul className="-mt-4">
          {next.map((r, i) => (
            <li key={r.id} className={`grid grid-cols-[64px_minmax(0,1fr)] items-baseline border-b border-ink/20 py-2.5 ${i === 2 ? 'opacity-40' : ''}`}>
              <span className="type-time text-[22px]">{new Date(r.starts_at) <= now ? 'NOW' : formatJstTime(r.starts_at)}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <PurposeMark purpose={r.purpose} />
                <span className="truncate">{PURPOSE_LABELS[r.purpose]}</span>
                <span className="ml-auto shrink-0 font-mono text-[13px] font-black">
                  {Math.min(r.capacity, r.approved_count + 1)}/{r.capacity}
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
