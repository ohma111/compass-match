import Link from 'next/link';
import { listRecruitments } from '@/lib/queries';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { listFilterSchema } from '@/lib/validation/schemas';
import { PURPOSES, PURPOSE_LABELS } from '@/lib/constants';
import { isSupabaseConfigured } from '@/lib/env';
import type { Recruitment } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: '募集一覧' };

const DAYS = [
  { key: 'all', label: 'すべて' },
  { key: 'today', label: '今日' },
  { key: 'tomorrow', label: '明日' },
] as const;

function href(day: string, purpose: string) {
  const p = new URLSearchParams();
  if (day !== 'all') p.set('day', day);
  if (purpose !== 'all') p.set('purpose', purpose);
  const s = p.toString();
  return `/recruitments${s ? `?${s}` : ''}`;
}

export default async function RecruitmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filter = listFilterSchema.parse(await searchParams);
  let items: Recruitment[] = [];
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      items = await listRecruitments(filter);
    } catch {
      loadError = true;
    }
  }
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${active ? 'border-brand bg-brand/15 font-bold text-brand' : 'border-line bg-surface'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">募集一覧</h1>
        <Link href="/recruitments/new" className="btn-primary btn-sm">募集する</Link>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" aria-label="日付で絞り込み">
          {DAYS.map((d) => (
            <Link key={d.key} href={href(d.key, filter.purpose)} className={pill(filter.day === d.key)}>
              {d.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="目的で絞り込み">
          <Link href={href(filter.day, 'all')} className={pill(filter.purpose === 'all')}>すべての目的</Link>
          {PURPOSES.map((p) => (
            <Link key={p} href={href(filter.day, p)} className={pill(filter.purpose === p)}>
              {PURPOSE_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>
      {loadError && <p className="alert-error">募集を読み込めませんでした。</p>}
      {!loadError && items.length === 0 && (
        <div className="card text-sm">
          <p className="font-bold">条件に合う募集はまだありません。</p>
          <p className="mt-1 text-muted">絞り込みを変えるか、あなたが最初の募集を出してみませんか?</p>
        </div>
      )}
      <div className="space-y-3">
        {items.map((r) => (
          <RecruitmentCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
