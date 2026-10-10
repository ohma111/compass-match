import { Fragment } from 'react';
import Link from '@/components/Link';
import { Plus, Radio } from 'lucide-react';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { PurposeMark } from '@/components/Tags';
import { NowLine } from '@/components/NowLine';
import { PURPOSES, PURPOSE_LABELS, type Purpose } from '@/lib/constants';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';
import type { AuthState } from '@/components/JoinButton';
import { formatJstTime, isSameJstDay, jstParts } from '@/lib/time';

export interface HomeViewProps {
  items: Recruitment[];
  states: Record<string, JoinState>;
  /** 自分がブロックしている人がいる募集 */
  blocked?: string[];
  auth: AuthState;
  viewerId?: string | null;
  filter: { purpose: Purpose | 'all'; soon: boolean };
  now: Date;
  loadError?: boolean;
  availableNow?: boolean;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** 日付が変わる行の前に区切りを入れる (今日の分は入れない) */
function dayChanges(items: Recruitment[], i: number, now: Date): boolean {
  const s = items[i].starts_at;
  if (isSameJstDay(s, now) || new Date(s) <= now) return false;
  return i === 0 || !isSameJstDay(s, items[i - 1].starts_at) || isSameJstDay(items[i - 1].starts_at, now) || new Date(items[i - 1].starts_at) <= now;
}

function dayLabel(iso: string): string {
  const p = jstParts(iso);
  return `${String(p.month).padStart(2, '0')}.${String(p.day).padStart(2, '0')} ${WEEKDAYS[p.weekday]}`;
}

function href(purpose: Purpose | 'all', soon: boolean) {
  const p = new URLSearchParams();
  if (purpose !== 'all') p.set('purpose', purpose);
  if (soon) p.set('soon', '1');
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/** ホーム = 今夜の時間割。募集を開始時刻の順に、時刻を左に置いて並べる */
export function HomeView({ items, states, blocked = [], auth, viewerId, filter, now, loadError, availableNow }: HomeViewProps) {
  const filtered = filter.purpose !== 'all' || filter.soon;
  const d = jstParts(now);
  const dateLine = `${String(d.month).padStart(2, '0')}.${String(d.day).padStart(2, '0')} ${WEEKDAYS[d.weekday]}`;

  const chip = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-2 border-2 px-3.5 text-sm font-bold transition-colors ${
      active ? 'border-ink bg-ink text-white' : 'border-ink/25 text-ink-2 hover:border-ink'
    }`;

  const chips = (
    <nav
      aria-label="目的で絞り込み"
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pr-12 pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pr-0 lg:[mask-image:none]"
    >
      <Link href={href('all', filter.soon)} className={chip(filter.purpose === 'all')} aria-current={filter.purpose === 'all' ? 'true' : undefined}>
        すべて
      </Link>
      {PURPOSES.map((p) => (
        <Link key={p} href={href(p, filter.soon)} className={chip(filter.purpose === p)} aria-current={filter.purpose === p ? 'true' : undefined}>
          <PurposeMark purpose={p} />
          {PURPOSE_LABELS[p]}
        </Link>
      ))}
    </nav>
  );
  const soonSwitch = (
    <Link href={href(filter.purpose, !filter.soon)} role="switch" aria-checked={filter.soon} className="inline-flex min-h-11 items-center gap-2.5 text-sm font-bold">
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-ink transition-colors ${filter.soon ? 'bg-ink' : 'bg-transparent'}`}
        aria-hidden
      >
        <span className={`absolute size-4 rounded-full transition-[left] duration-200 ${filter.soon ? 'left-[1.3rem] bg-signal' : 'left-0.5 bg-ink'}`} />
      </span>
      30分以内
    </Link>
  );

  return (
    <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="type-tag text-slate">
          {dateLine} / {formatJstTime(now)} JST
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="type-poster text-[clamp(40px,12.5vw,56px)] whitespace-nowrap lg:text-[112px] lg:whitespace-normal">
            <span aria-hidden>
              TIME <br className="hidden lg:block" />
              TABLE
            </span>
            <span className="sr-only">募集中のパーティ</span>
          </h1>
          <p className="flex items-baseline gap-1.5 pb-0.5 lg:hidden" aria-live="polite">
            <span className="type-time text-[34px]">{loadError ? '―' : String(items.length).padStart(2, '0')}</span>
            <span className="type-tag text-slate">OPEN</span>
          </p>
        </div>
        <p className="mt-4 hidden items-baseline gap-2 lg:flex" aria-live="polite">
          <span className="type-time text-[44px]">{loadError ? '―' : String(items.length).padStart(2, '0')}</span>
          <span className="type-tag text-slate">OPEN</span>
        </p>
        <div className="mt-4 space-y-2 lg:mt-6 lg:space-y-4">
          {chips}
          {soonSwitch}
        </div>
        <div className="mt-6 hidden border-t-2 border-ink pt-6 lg:block">
          <Link href="/recruitments/new" className="btn-signal btn-lg w-full">
            <Plus className="size-5" strokeWidth={3} aria-hidden />
            募集する
          </Link>
        </div>
        {availableNow && (
          <Link href="/now" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4">
            <Radio className="size-4 text-ok" aria-hidden />
            今から遊べる人を見る
          </Link>
        )}
      </aside>

      <section aria-label="募集一覧" className="mt-5 lg:mt-0">
        {loadError && <p className="alert-error">募集を読み込めませんでした。ページを再読み込みしてください</p>}

        {!loadError && items.length === 0 && (
          <div className="grid grid-cols-[64px_minmax(0,1fr)] border-y-2 border-ink lg:grid-cols-[132px_minmax(0,1fr)]">
            <p className="type-time pt-4 text-[30px] text-ink/30 lg:pt-6 lg:text-[44px]">--:--</p>
            <div className="border-l border-ink/80 py-6 pl-4 lg:py-10 lg:pl-6">
              <h2 className="text-[20px] leading-snug font-black text-balance lg:text-[26px]">
                {filtered ? 'この条件の募集はありません' : 'まだ募集はありません'}
              </h2>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link href="/recruitments/new" className="btn-signal btn-lg">
                  <Plus className="size-5" strokeWidth={3} aria-hidden />
                  募集する
                </Link>
                {filtered && (
                  <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4">
                    絞り込みを解除
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="border-b-2 border-ink">
            {items.map((r, i) => (
              <Fragment key={r.id}>
                {new Date(r.starts_at) > now && (i === 0 || new Date(items[i - 1].starts_at) <= now) && <NowLine serverNow={now.toISOString()} />}
                {dayChanges(items, i, now) && (
                  <p className="type-tag border-t-4 border-ink bg-ink py-1 pl-2 text-white">{dayLabel(r.starts_at)}</p>
                )}
                <RecruitmentCard
                r={r}
                now={now}
                auth={auth}
                viewerId={viewerId}
                myState={states[r.id]}
                blockedHere={blocked.includes(r.id)}
                index={i}
                repeatTime={i > 0 && items[i - 1].starts_at === r.starts_at && new Date(r.starts_at) > now}
                />
              </Fragment>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
