import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { NOTIFICATION_LABELS } from '@/lib/constants';
import { formatJst } from '@/lib/time';
import { ActionButton } from '@/components/ActionButton';
import { markNotificationsReadAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '通知' };

interface Row {
  id: string;
  kind: string;
  recruitment_id: string | null;
  read_at: string | null;
  created_at: string;
  recruitment: { title: string } | null;
}

export default async function NotificationsPage() {
  const viewer = await requireViewer('/notifications');
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, kind, recruitment_id, read_at, created_at, recruitment:recruitments(title)')
    .eq('user_id', viewer.userId)
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (data ?? []) as unknown as Row[];
  const unread = rows.some((r) => !r.read_at);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">通知</h1>
        {unread && (
          <ActionButton action={markNotificationsReadAction} className="btn-outline btn-sm">
            すべて既読にする
          </ActionButton>
        )}
      </div>
      {rows.length === 0 && <p className="text-sm text-muted">通知はまだありません。</p>}
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id}>
            <Link
              href={n.recruitment_id ? `/recruitments/${n.recruitment_id}` : '#'}
              className={`card block py-3 ${n.read_at ? 'opacity-70' : 'border-brand/50'}`}
            >
              <p className="text-sm font-bold">
                {!n.read_at && <span className="mr-1 inline-block size-2 rounded-full bg-brand" aria-label="未読" />}
                {NOTIFICATION_LABELS[n.kind] ?? 'お知らせ'}
              </p>
              {n.recruitment && <p className="text-sm text-muted">{n.recruitment.title}</p>}
              <p className="text-xs text-muted">{formatJst(n.created_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
