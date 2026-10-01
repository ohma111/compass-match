import Link from 'next/link';
import { Bell, CircleCheck, CircleX, Hand, LogOut, MessageCircle, UserMinus, UserPlus, type LucideIcon } from 'lucide-react';
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

const ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  joined: { icon: UserPlus, color: 'text-ok' },
  join_request: { icon: Hand, color: 'text-brand' },
  approved: { icon: CircleCheck, color: 'text-ok' },
  rejected: { icon: CircleX, color: 'text-muted' },
  removed: { icon: UserMinus, color: 'text-muted' },
  participant_cancelled: { icon: LogOut, color: 'text-warn' },
  recruitment_cancelled: { icon: CircleX, color: 'text-danger' },
  new_message: { icon: MessageCircle, color: 'text-p-rank' },
};

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
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">通知</h1>
        {unread && (
          <ActionButton action={markNotificationsReadAction} className="btn-outline btn-sm">
            すべて既読
          </ActionButton>
        )}
      </div>
      {rows.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
          <Bell className="size-8" aria-hidden />
          まだ通知はありません。誰かが参加したり、申請が来たらここに出ます。
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((n) => {
          const meta = ICONS[n.kind] ?? { icon: Bell, color: 'text-muted' };
          const Icon = meta.icon;
          const body = (
            <>
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 ${meta.color}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {NOTIFICATION_LABELS[n.kind] ?? 'お知らせ'}
                  {!n.read_at && <span className="sr-only">(未読)</span>}
                </span>
                {n.recruitment && <span className="block truncate text-sm text-muted">{n.recruitment.title}</span>}
                <span className="block text-xs text-muted tabular-nums">{formatJst(n.created_at)}</span>
              </span>
              {!n.read_at && <span className="size-2.5 shrink-0 rounded-full bg-brand shadow-[0_0_8px_var(--color-brand)]" aria-hidden />}
            </>
          );
          const cls = `card flex items-center gap-3 py-3 ${n.read_at ? 'opacity-70' : 'border-brand/40'}`;
          return (
            <li key={n.id}>
              {n.recruitment_id ? (
                <Link href={`/recruitments/${n.recruitment_id}`} className={cls}>{body}</Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
