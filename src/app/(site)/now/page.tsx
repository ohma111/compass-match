import { notFound } from 'next/navigation';
import Link from 'next/link';
import { features } from '@/lib/env';
import { getRegisteredViewer } from '@/lib/auth';
import { SignInGate } from '@/components/GateScreens';
import { createClient } from '@/lib/supabase/server';
import { nowListView } from '@/lib/now-list';
import { formatJstTime } from '@/lib/time';
import { rankLabel } from '@/lib/constants';
import { ActionButton } from '@/components/ActionButton';
import { setAvailableNowAction } from '@/app/actions';
import type { RankBand } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: '今から遊べる' };

export default async function NowPage() {
  // 機能フラグ (NEXT_PUBLIC_FEATURE_AVAILABLE_NOW) がOFFなら存在しないページとして扱う
  if (!features.availableNow) notFound();
  const viewer = await getRegisteredViewer();
  if (!viewer) return <SignInGate title="今から遊べる人" lead="プロフィールを作成すると表示されます。" />;
  const supabase = await createClient();
  const { data } = await supabase
    .from('presence_now')
    .select('user_id, expires_at, profile:profiles(id, display_name, rank_band)')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = ((data ?? []) as unknown as { user_id: string; expires_at: string; profile: { id: string; display_name: string; rank_band: RankBand } | null }[]).filter((r) => r.profile);
  const mine = rows.find((r) => r.user_id === viewer.userId);
  const others = rows.filter((r) => r.user_id !== viewer.userId);
  const view = nowListView(rows.length, features.nowListMinUsers);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[34px]">今から遊べる</h1>
      <p className="text-sm text-muted">「今から遊べる」を押すと、この一覧に3時間表示されます。</p>
      {mine ? (
        <div className="card space-y-2">
          <p className="text-sm">{formatJstTime(mine.expires_at)} まで表示されます。</p>
          <ActionButton action={setAvailableNowAction.bind(null, false)} className="btn-outline btn-sm">表示をやめる</ActionButton>
        </div>
      ) : (
        <ActionButton action={setAvailableNowAction.bind(null, true)} className="btn-primary w-full">今から遊べる</ActionButton>
      )}
      <section className="space-y-2">
        <h2 className="font-bold">{view.showCount ? view.countLabel : '今遊べる人'}</h2>
        {others.length === 0 ? (
          <p className="text-sm text-muted">まだ誰もいません。<Link href="/recruitments/new" className="link">募集する</Link></p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {others.map((r) => (
              <li key={r.user_id}>
                <Link href={`/users/${r.user_id}`} className="chip py-1 text-sm text-fg">
                  {r.profile!.display_name}<span className="ml-1 text-muted">{rankLabel(r.profile!.rank_band)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
