import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { MOOD_TAG_LABELS, PLAY_ROLE_LABELS, PROFILE_VC_LABELS, PURPOSE_LABELS, RANK_LABELS } from '@/lib/constants';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import { blockUserAction } from '@/app/actions';
import type { Profile } from '@/lib/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const viewer = await requireViewer(`/users/${id}`);
  const supabase = await createClient();
  const [{ data }, { data: block }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', viewer.userId).eq('blocked_id', id).maybeSingle(),
  ]);
  const p = data as Profile | null;
  if (!p) notFound();
  const isMe = viewer.userId === id;
  const blocked = Boolean(block);

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{p.display_name}</h1>
          <span className="chip">{RANK_LABELS[p.rank_band]}</span>
        </div>
        <dl className="grid grid-cols-[6em_1fr] gap-y-1 text-sm">
          <dt className="text-muted">得意ロール</dt>
          <dd>{p.play_roles.map((r) => PLAY_ROLE_LABELS[r]).join('・') || '―'}</dd>
          <dt className="text-muted">よく使う</dt>
          <dd>{p.characters.join('・') || '―'}</dd>
          <dt className="text-muted">目的</dt>
          <dd>{p.purposes.map((x) => PURPOSE_LABELS[x]).join('・') || '―'}</dd>
          <dt className="text-muted">VC</dt>
          <dd>{PROFILE_VC_LABELS[p.vc]}</dd>
        </dl>
        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.tags.map((t) => <span key={t} className="chip">#{MOOD_TAG_LABELS[t]}</span>)}
          </div>
        )}
        {p.bio && <p className="whitespace-pre-wrap break-words text-sm">{p.bio}</p>}
        <p className="text-xs text-muted">連絡先は、募集で参加が承認された相手にだけ表示されます。</p>
      </section>
      {isMe ? (
        <Link href="/profile/edit" className="btn-outline w-full">プロフィールを編集</Link>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton
            action={blockUserAction.bind(null, id, !blocked)}
            className="btn-outline btn-sm"
            confirm={blocked ? 'ブロックを解除しますか?' : 'このユーザーをブロックしますか? お互いの募集に参加できなくなり、相手の募集が見えなくなります。'}
          >
            {blocked ? 'ブロック解除' : 'ブロック'}
          </ActionButton>
          <ReportButton targetType="user" targetId={id} small={false} />
        </div>
      )}
    </div>
  );
}
