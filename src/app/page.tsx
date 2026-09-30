import Link from 'next/link';
import { Plus, Radio } from 'lucide-react';
import { listRecruitments, myJoinStates } from '@/lib/queries';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { isSupabaseConfigured, features } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { authStateOf } from '@/lib/auth';
import { listFilterSchema } from '@/lib/validation/schemas';
import { PURPOSES, PURPOSE_LABELS, type Purpose } from '@/lib/constants';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';

export const dynamic = 'force-dynamic';

function href(purpose: Purpose | 'all', soon: boolean) {
  const p = new URLSearchParams();
  if (purpose !== 'all') p.set('purpose', purpose);
  if (soon) p.set('soon', '1');
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filter = listFilterSchema.parse(await searchParams);
  const now = new Date();
  const viewer = await getViewerSafe();
  const auth = authStateOf(viewer);
  let items: Recruitment[] = [];
  let states: Record<string, JoinState> = {};
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      items = await listRecruitments({ purpose: filter.purpose, soon: filter.soon }, now);
      if (viewer) states = await myJoinStates(viewer.userId, items.map((r) => r.id));
    } catch {
      loadError = true;
    }
  }
  const filtered = filter.purpose !== 'all' || filter.soon;

  const chip = (active: boolean, tone?: Purpose) =>
    `${tone ? `tone-${tone}` : ''} inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition ${
      active
        ? 'border-[var(--tone,var(--color-fg))] bg-[color-mix(in_srgb,var(--tone,var(--color-fg))_16%,transparent)] text-[var(--tone,var(--color-fg))]'
        : 'border-line bg-surface text-muted hover:text-fg'
    }`;

  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-3">
        <div>
          <p className="section-title">NOW RECRUITING</p>
          <h1 className="mt-1 text-2xl font-extrabold">
            募集中 <span className="text-brand tabular-nums">{loadError ? '-' : items.length}</span>
            <span className="ml-0.5 text-base">件</span>
          </h1>
        </div>
        <Link
          href={href(filter.purpose, !filter.soon)}
          aria-pressed={filter.soon}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-extrabold transition ${
            filter.soon ? 'border-ok bg-ok/15 text-ok' : 'border-line bg-surface text-muted'
          }`}
        >
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${filter.soon ? 'bg-ok' : 'bg-raise'}`}
            aria-hidden
          >
            <span className={`absolute size-4 rounded-full bg-white transition-all ${filter.soon ? 'left-[1.1rem]' : 'left-0.5'}`} />
          </span>
          今すぐ
        </Link>
      </section>

      <nav aria-label="目的で絞り込み" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href('all', filter.soon)} className={chip(filter.purpose === 'all')} aria-current={filter.purpose === 'all' ? 'true' : undefined}>
          すべて
        </Link>
        {PURPOSES.map((p) => (
          <Link key={p} href={href(p, filter.soon)} className={chip(filter.purpose === p, p)} aria-current={filter.purpose === p ? 'true' : undefined}>
            {PURPOSE_LABELS[p]}
          </Link>
        ))}
      </nav>

      {features.availableNow && (
        <Link href="/now" className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-bold">
          <Radio className="size-4 text-ok" aria-hidden />
          今から遊べる人を見る
        </Link>
      )}

      {loadError && <p className="alert-error">募集を読み込めませんでした。時間をおいて再読み込みしてください。</p>}

      {!loadError && items.length === 0 && (
        <section className="card space-y-4 border-dashed px-5 py-8 text-center">
          <p className="text-lg font-extrabold leading-snug">
            {filtered ? (
              '条件に合う募集はまだありません'
            ) : (
              <>
                今夜の募集を
                <br />
                最初に出してみませんか?
              </>
            )}
          </p>
          <p className="text-sm text-muted">目的と時間をタップするだけ。10秒で募集できます。</p>
          <Link href="/recruitments/new" className="btn-primary btn-lg w-full">
            <Plus className="size-5" strokeWidth={3} aria-hidden />
            募集する
          </Link>
          {filtered && (
            <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-muted underline underline-offset-2">
              絞り込みを解除
            </Link>
          )}
        </section>
      )}

      <div className="space-y-3">
        {items.map((r) => (
          <RecruitmentCard key={r.id} r={r} now={now} auth={auth} viewerId={viewer?.userId} myState={states[r.id]} />
        ))}
      </div>
    </div>
  );
}
