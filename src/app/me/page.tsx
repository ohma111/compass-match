import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { signOutAction } from '@/app/actions';
import type { Recruitment } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'マイページ' };

const PART_LABEL: Record<string, string> = { pending: '承認待ち', approved: '参加確定', rejected: '見送り', cancelled: '取り消し' };

export default async function MePage() {
  const viewer = await requireViewer('/me');
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const cols = 'id, owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, status, approved_count, hidden_at, created_at';
  const [{ data: mine }, { data: parts }] = await Promise.all([
    supabase.from('recruitments').select(cols).eq('owner_id', viewer.userId).gt('ends_at', since).order('starts_at').limit(20),
    supabase
      .from('participations')
      .select(`status, recruitment:recruitments(${cols})`)
      .eq('user_id', viewer.userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const joined = ((parts ?? []) as unknown as { status: string; recruitment: Recruitment | null }[]).filter(
    (p) => p.recruitment && new Date(p.recruitment.ends_at).getTime() > Date.now() - 24 * 3600_000,
  );

  return (
    <div className="space-y-6">
      <section className="card flex items-center gap-3">
        <div className="mr-auto">
          <p className="font-bold">{viewer.profile?.display_name}</p>
          <Link href={`/users/${viewer.userId}`} className="text-xs link">公開プロフィールを見る</Link>
        </div>
        <Link href="/profile/edit" className="btn-outline btn-sm">編集</Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">自分の募集</h2>
        {(mine ?? []).length === 0 && <p className="text-sm text-muted">進行中の募集はありません。</p>}
        {((mine ?? []) as unknown as Recruitment[]).map((r) => <RecruitmentCard key={r.id} r={r} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">参加予定・申請中</h2>
        {joined.length === 0 && <p className="text-sm text-muted">参加予定の募集はありません。</p>}
        {joined.map((p) => (
          <div key={p.recruitment!.id} className="space-y-1">
            <span className="chip-brand">{PART_LABEL[p.status]}</span>
            <RecruitmentCard r={p.recruitment!} />
          </div>
        ))}
      </section>

      <section className="space-y-2 text-sm">
        <Link href="/me/blocks" className="link block">ブロックしたユーザー</Link>
        <form action={signOutAction}>
          <button className="btn-outline btn-sm">ログアウト</button>
        </form>
      </section>
    </div>
  );
}
