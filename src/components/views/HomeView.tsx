import { Fragment } from 'react';
import Link from '@/components/Link';
import { Plus, Radio } from 'lucide-react';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { PurposeMark } from '@/components/Tags';
import { NowLine } from '@/components/NowLine';
import { PURPOSES, PURPOSE_LABELS, RECRUIT_VC_LABELS, RECRUIT_VC, STANCES, STANCE_LABELS } from '@/lib/constants';
import { LIST_SORTS, LIST_SORT_LABELS, hasExtraFilter, listHref, type ListView } from '@/lib/list-filter';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';
import type { AuthState } from '@/components/JoinButton';
import { formatJstTime, isSameJstDay, jstParts } from '@/lib/time';

export interface HomeViewProps {
  items: Recruitment[];
  /** 絞り込む前の件数 */
  total?: number;
  /** 自分の募集・参加中 (申請中を含む) の募集 */
  myRooms?: Recruitment[];
  /** ランクを登録していて「参加できる募集だけ」を使える */
  canEligible?: boolean;
  states: Record<string, JoinState>;
  /** 自分がブロックしている人がいる募集 */
  blocked?: string[];
  auth: AuthState;
  viewerId?: string | null;
  filter: ListView;
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


/** ホーム = 今夜の時間割。募集を開始時刻の順に、時刻を左に置いて並べる */
export function HomeView({ items, total, myRooms = [], canEligible = false, states, blocked = [], auth, viewerId, filter, now, loadError, availableNow }: HomeViewProps) {
  const filtered = filter.purpose !== 'all' || filter.soon || hasExtraFilter(filter);
  // 開始時刻の順のときだけ、時間割の区切り (いまの線・日付) を入れる
  const timetable = filter.sort === 'start';
  const extraCount = [filter.vc, filter.stance, filter.sort !== 'start' ? filter.sort : undefined].filter(Boolean).length;
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
      <Link href={listHref(filter, { purpose: 'all' })} className={chip(filter.purpose === 'all')} aria-current={filter.purpose === 'all' ? 'true' : undefined}>
        すべて
      </Link>
      {PURPOSES.map((p) => (
        <Link key={p} href={listHref(filter, { purpose: p })} className={chip(filter.purpose === p)} aria-current={filter.purpose === p ? 'true' : undefined}>
          <PurposeMark purpose={p} />
          {PURPOSE_LABELS[p]}
        </Link>
      ))}
    </nav>
  );
  const toggle = (on: boolean, to: string, label: string) => (
    <Link href={to} role="switch" aria-checked={on} className="inline-flex min-h-11 items-center gap-2.5 text-sm font-bold">
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-ink transition-colors ${on ? 'bg-ink' : 'bg-transparent'}`}
        aria-hidden
      >
        <span className={`absolute size-4 rounded-full transition-[left] duration-200 ${on ? 'left-[1.3rem] bg-signal' : 'left-0.5 bg-ink'}`} />
      </span>
      {label}
    </Link>
  );
  const option = (on: boolean, to: string, label: string) => (
    <Link
      href={to}
      aria-current={on ? 'true' : undefined}
      className={`inline-flex min-h-10 items-center border-2 px-3 text-[13px] font-bold ${on ? 'border-ink bg-ink text-white' : 'border-ink/25 text-ink-2 hover:border-ink'}`}
    >
      {label}
    </Link>
  );
  const soonSwitch = (
    <div className="flex flex-wrap gap-x-5">
      {toggle(filter.soon, listHref(filter, { soon: !filter.soon }), '30分以内')}
      {toggle(filter.open, listHref(filter, { open: !filter.open }), '空きあり')}
      {canEligible && toggle(filter.eligible, listHref(filter, { eligible: !filter.eligible }), '参加できるランク')}
    </div>
  );
  const more = (
    <details className="group border-2 border-ink/25 open:border-ink" open={extraCount > 0}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-bold">
        <span>VC・遊び方・並び順{extraCount > 0 ? ` (${extraCount})` : ''}</span>
        <span aria-hidden className="inline-block transition-transform group-open:rotate-45">＋</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <div>
          <p className="mb-1 text-[12px] font-bold text-slate">VC</p>
          <div className="flex flex-wrap gap-1.5">
            {option(!filter.vc, listHref(filter, { vc: undefined }), 'すべて')}
            {RECRUIT_VC.map((v) => option(filter.vc === v, listHref(filter, { vc: v }), RECRUIT_VC_LABELS[v]))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[12px] font-bold text-slate">遊び方</p>
          <div className="flex flex-wrap gap-1.5">
            {option(!filter.stance, listHref(filter, { stance: undefined }), 'すべて')}
            {STANCES.map((st) => option(filter.stance === st, listHref(filter, { stance: st }), STANCE_LABELS[st]))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[12px] font-bold text-slate">並び順</p>
          <div className="flex flex-wrap gap-1.5">
            {LIST_SORTS.map((so) => option(filter.sort === so, listHref(filter, { sort: so }), LIST_SORT_LABELS[so]))}
          </div>
        </div>
      </div>
    </details>
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
          {more}
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
        {myRooms.length > 0 && (
          <nav aria-label="参加中の募集" className="mb-5 border-2 border-ink bg-ink text-white">
            <p className="px-3 pt-2 text-[12px] font-bold text-white/75">参加中・自分の募集</p>
            <ul className="divide-y divide-white/20">
              {myRooms.map((r) => (
                <li key={r.id}>
                  <Link href={`/recruitments/${r.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2">
                    <span className="type-time shrink-0 text-[18px]">{formatJstTime(r.starts_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{r.title}</span>
                    <span className="shrink-0 bg-signal px-1.5 text-[12px] font-black text-ink">
                      {r.owner_id === viewerId ? '自分の募集' : states[r.id] === 'pending' ? '承認待ち' : '参加中'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {!loadError && filtered && total !== undefined && total > items.length && (
          <p className="mb-2 text-[13px] text-slate">
            {total}件中 {items.length}件を表示
            <Link href="/" className="ml-3 font-bold text-ink underline underline-offset-4">絞り込みを解除</Link>
          </p>
        )}

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
                {timetable && new Date(r.starts_at) > now && (i === 0 || new Date(items[i - 1].starts_at) <= now) && <NowLine serverNow={now.toISOString()} />}
                {timetable && dayChanges(items, i, now) && (
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
                repeatTime={timetable && i > 0 && items[i - 1].starts_at === r.starts_at && new Date(r.starts_at) > now}
                />
              </Fragment>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
