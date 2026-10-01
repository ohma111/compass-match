import Link from 'next/link';
import { Plus, Radio } from 'lucide-react';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { Lineup } from '@/components/Lineup';
import { PURPOSES, PURPOSE_LABELS, type Purpose } from '@/lib/constants';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';
import type { AuthState } from '@/components/JoinButton';
import { canRequestJoin } from '@/lib/capacity';
import { countdownTone } from '@/lib/time';

export interface HomeViewProps {
  items: Recruitment[];
  states: Record<string, JoinState>;
  auth: AuthState;
  viewerId?: string | null;
  filter: { purpose: Purpose | 'all'; soon: boolean };
  now: Date;
  loadError?: boolean;
  availableNow?: boolean;
}

function href(purpose: Purpose | 'all', soon: boolean) {
  const p = new URLSearchParams();
  if (purpose !== 'all') p.set('purpose', purpose);
  if (soon) p.set('soon', '1');
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/** ホーム = 募集フィード */
export function HomeView({ items, states, auth, viewerId, filter, now, loadError, availableNow }: HomeViewProps) {
  const filtered = filter.purpose !== 'all' || filter.soon;
  // 先頭が「まもなく(30分以内)・まだ入れる」募集なら大きく見せる
  const first = items[0];
  const featuredId =
    first &&
    countdownTone(first.starts_at, first.ends_at, now) === 'soon' &&
    canRequestJoin({ status: first.status, endsAt: first.ends_at, capacity: first.capacity, approvedCount: first.approved_count, isOwner: first.owner_id === viewerId, myState: states[first.id] ?? 'none', now }).ok
      ? first.id
      : null;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[3px] border-2 px-3.5 text-sm font-bold ${
      active ? 'border-ink bg-ink text-white' : 'border-line bg-sheet text-ink-2 hover:border-slate'
    } lg:min-h-12 lg:border-0 lg:border-b lg:border-line lg:rounded-none lg:px-3 lg:text-[15px] ${active ? 'lg:bg-ink' : 'lg:bg-transparent lg:hover:bg-sheet'}`;

  const filters = (
    <>
      <nav aria-label="目的で絞り込み" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t-2 lg:border-ink lg:px-0 lg:pb-0">
        <Link href={href('all', filter.soon)} className={chip(filter.purpose === 'all')} aria-current={filter.purpose === 'all' ? 'true' : undefined}>
          すべて
        </Link>
        {PURPOSES.map((p) => (
          <Link key={p} href={href(p, filter.soon)} className={`tone-${p} ${chip(filter.purpose === p)}`} aria-current={filter.purpose === p ? 'true' : undefined}>
            <span aria-hidden className="h-3.5 w-1.5 [transform:skewX(var(--seat-skew))] bg-[var(--tone)]" />
            {PURPOSE_LABELS[p]}
          </Link>
        ))}
      </nav>
      <Link
        href={href(filter.purpose, !filter.soon)}
        aria-pressed={filter.soon}
        className="inline-flex min-h-11 items-center gap-2.5 text-sm font-bold"
      >
        <span className={`relative inline-flex h-6 w-11 shrink-0 items-center border-2 border-ink ${filter.soon ? 'bg-signal' : 'bg-sheet'}`} aria-hidden>
          <span className={`absolute size-4 bg-ink transition-[left] ${filter.soon ? 'left-[1.3rem] bg-white' : 'left-0.5'}`} />
        </span>
        30分以内に始まる募集だけ
      </Link>
    </>
  );

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="flex items-end justify-between gap-3 lg:block">
          <h1 className="font-display text-[26px] leading-tight lg:text-[40px]">
            募集中の
            <br className="hidden lg:block" />
            パーティ
          </h1>
          <p className="shrink-0 pb-1 text-sm font-bold text-slate lg:mt-3 lg:pb-0" aria-live="polite">
            {loadError ? '―' : <><span className="font-display text-xl text-ink">{items.length}</span> 件</>}
          </p>
        </div>
        <p className="hidden text-sm leading-relaxed text-slate lg:block">
          空いている席に入れば、そのまま一緒に遊べます。部屋番号は参加した人にだけ表示されます。
        </p>
        <div className="space-y-3">{filters}</div>
        <div className="hidden space-y-3 border-t-2 border-ink pt-5 lg:block">
          <p className="text-sm font-bold">ちょうどいい募集がない?</p>
          <Link href="/recruitments/new" className="btn-primary btn-lg w-full">
            <Plus className="size-5" strokeWidth={3} aria-hidden />
            自分で募集する
          </Link>
        </div>
        {availableNow && (
          <Link href="/now" className="flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4">
            <Radio className="size-4 text-ok" aria-hidden />
            今から遊べる人を見る
          </Link>
        )}
      </aside>

      <section aria-label="募集一覧" className="mt-6 lg:mt-0">
        {loadError && <p className="alert-error">募集を読み込めませんでした。時間をおいて再読み込みしてください。</p>}

        {!loadError && items.length === 0 && (
          <div className="sheet px-5 pt-8 pb-7 lg:px-10 lg:pt-12 lg:pb-10">
            <div className="mx-auto max-w-md">
              <Lineup seats={[{ kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }]} size="lg" label="空いている3つの席" />
            </div>
            <div className="mx-auto mt-7 max-w-md space-y-4 text-center">
              <h2 className="font-display text-[19px] leading-snug text-balance sm:text-[22px]">
                {filtered ? '条件に合う募集はまだありません' : 'いま出ている募集はありません'}
              </h2>
              <p className="text-sm text-slate">目的と時間をタップして、下のボタンを押すだけで募集できます。</p>
              <Link href="/recruitments/new" className="btn-primary btn-lg w-full">
                <Plus className="size-5" strokeWidth={3} aria-hidden />
                最初の募集を出す
              </Link>
              {filtered && (
                <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4">
                  絞り込みをやめる
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          {items.map((r) => (
            <RecruitmentCard key={r.id} r={r} now={now} auth={auth} viewerId={viewerId} myState={states[r.id]} featured={r.id === featuredId} />
          ))}
        </div>
      </section>
    </div>
  );
}
