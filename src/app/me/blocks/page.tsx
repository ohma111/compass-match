import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ActionButton } from '@/components/ActionButton';
import { blockUserAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ブロックしたユーザー' };

export default async function BlocksPage() {
  const viewer = await requireViewer('/me/blocks');
  const supabase = await createClient();
  const { data } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, profile:profiles!blocks_blocked_id_fkey(display_name)')
    .eq('blocker_id', viewer.userId)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as unknown as { blocked_id: string; profile: { display_name: string } | null }[];
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">ブロックしたユーザー</h1>
      {rows.length === 0 && <p className="text-sm text-muted">ブロックしているユーザーはいません。</p>}
      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.blocked_id} className="card flex items-center justify-between py-3">
            <span>{b.profile?.display_name ?? '(非表示のユーザー)'}</span>
            <ActionButton action={blockUserAction.bind(null, b.blocked_id, false)} className="btn-outline btn-sm">
              解除
            </ActionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
