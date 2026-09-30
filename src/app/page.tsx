import Link from 'next/link';
import { listRecruitments } from '@/lib/queries';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { isSupabaseConfigured } from '@/lib/env';
import type { Recruitment } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let today: Recruitment[] = [];
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      today = await listRecruitments({ day: 'today', purpose: 'all', limit: 20 });
    } catch {
      loadError = true;
    }
  }
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-bold leading-snug">#コンパスで、今夜いっしょに遊べる人をさがそう</h1>
        <p className="text-sm text-muted">
          ギルドやFFの外にいる人とも、募集ひとつでつながれます。参加が承認された相手にだけ連絡先と部屋番号が見えます。
        </p>
        <Link href="/recruitments/new" className="btn-primary w-full text-base">
          募集する
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">今日の募集</h2>
          <Link href="/recruitments" className="text-sm link">すべて見る</Link>
        </div>
        {loadError && <p className="alert-error">募集を読み込めませんでした。時間をおいて再読み込みしてください。</p>}
        {!loadError && today.length === 0 && (
          <div className="card space-y-2 text-sm">
            <p className="font-bold">今日の募集はこれから。最初のひとりになりませんか?</p>
            <p className="text-muted">
              募集は21〜22時ごろに増えやすいです。「21時から1戦だけ」など、気軽な募集でも大丈夫です。
            </p>
            <Link href="/recruitments/new" className="link">募集を出してみる</Link>
          </div>
        )}
        <div className="space-y-3">
          {today.map((r) => (
            <RecruitmentCard key={r.id} r={r} />
          ))}
        </div>
      </section>
    </div>
  );
}
