import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { PROFILE_SELECT } from '@/lib/profile-columns';
import { MOOD_TAG_LABELS, PLAY_ROLE_LABELS, PROFILE_VC_LABELS, PURPOSE_LABELS, RANK_LABELS } from '@/lib/constants';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import { RoleIcon } from '@/components/RoleIcon';
import { blockUserAction } from '@/app/actions';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const viewer = await requireViewer(`/users/${id}`);
  const supabase = await createClient();
  const [profileRes, { data: block }] = await Promise.all([
    // 列を明示する (select('*') は非公開列の権限エラーになる)
    supabase.from('profiles').select(PROFILE_SELECT).eq('id', id).maybeSingle(),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', viewer.userId).eq('blocked_id', id).maybeSingle(),
  ]);
  if (profileRes.error) throw new Error('プロフィールを読み込めませんでした');
  const p = profileRes.data as unknown as Profile | null;
  if (!p) notFound();
  const isMe = viewer.userId === id;
  const blocked = Boolean(block);
  const initial = Array.from(p.display_name.trim())[0] ?? '?';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="flex items-center gap-5">
        <div className="ml-3 flex h-28 w-22 shrink-0 items-end bg-ink px-3 pb-3 text-white [transform:skewX(var(--seat-skew))]">
          <span className="font-display text-[44px] leading-none [transform:skewX(calc(var(--seat-skew)*-1))]" aria-hidden>{initial}</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-display truncate text-[24px] leading-tight">{p.display_name}</h1>
          <p className="mt-1 text-sm font-bold">{RANK_LABELS[p.rank_band]}</p>
        </div>
      </section>
      <dl className="grid grid-cols-[6.5em_1fr] gap-y-3 border-y-2 border-ink py-4 text-sm">
        <dt className="text-slate">得意なロール</dt>
        <dd className="flex flex-wrap gap-x-3">
          {p.play_roles.length === 0
            ? '―'
            : p.play_roles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1">
                  <RoleIcon role={r} className="size-3.5" />
                  {PLAY_ROLE_LABELS[r]}
                </span>
              ))}
        </dd>
        <dt className="text-slate">よく使う</dt>
        <dd>{p.characters.join('、') || '―'}</dd>
        <dt className="text-slate">目的</dt>
        <dd>{p.purposes.map((x) => PURPOSE_LABELS[x]).join('、') || '―'}</dd>
        <dt className="text-slate">VC</dt>
        <dd>{PROFILE_VC_LABELS[p.vc]}</dd>
      </dl>
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span key={t} className="chip">#{MOOD_TAG_LABELS[t]}</span>
          ))}
        </div>
      )}
      {p.bio && <p className="border-l-4 border-line bg-sheet p-3 text-sm whitespace-pre-wrap break-words">{p.bio}</p>}
      <p className="text-xs text-slate">連絡先は、募集で参加が確定した相手にだけ表示されます。</p>
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
