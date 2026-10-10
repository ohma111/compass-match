import { ProfileSeat } from '@/components/Lineup';
import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { getRegisteredViewer } from '@/lib/auth';
import { SignInGate } from '@/components/GateScreens';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { PROFILE_SELECT } from '@/lib/profile-columns';
import { MOOD_TAG_LABELS, PLAY_ROLE_LABELS, PROFILE_VC_LABELS, PURPOSE_LABELS, rankLabel } from '@/lib/constants';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import { RoleIcon } from '@/components/RoleIcon';
import { FollowButton } from '@/components/FollowButton';
import { blockUserAction } from '@/app/actions';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const viewer = await getRegisteredViewer();
  if (!viewer) return <SignInGate title="プロフィール" lead="プロフィールを作成すると表示されます。" />;
  const supabase = await createClient();
  const [profileRes, { data: block }, { data: follow }, { data: mate }] = await Promise.all([
    // 列を明示する (select('*') は非公開列の権限エラーになる)
    supabase.from('profiles').select(PROFILE_SELECT).eq('id', id).maybeSingle(),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', viewer.userId).eq('blocked_id', id).maybeSingle(),
    supabase.from('follows').select('followee_id').eq('follower_id', viewer.userId).eq('followee_id', id).maybeSingle(),
    supabase.from('play_mates').select('times').eq('user_id', viewer.userId).eq('mate_id', id).maybeSingle(),
  ]);
  if (profileRes.error) throw new Error('プロフィールを読み込めませんでした');
  const p = profileRes.data as unknown as Profile | null;
  if (!p) notFound();
  const isMe = viewer.userId === id;
  const blocked = Boolean(block);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="flex items-center gap-6">
        <ProfileSeat id={p.id} roles={p.play_roles} rank={p.rank_band} avatar={p.avatar ?? null} />
        <div className="min-w-0">
          <h1 className="font-black tracking-[-0.01em] truncate text-[24px] leading-tight">{p.display_name}</h1>
          <p className="mt-1 text-sm font-bold">{rankLabel(p.rank_band)}</p>
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
        <dt className="text-slate">よく使うキャラ</dt>
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
      {p.bio && <p className="border-2 border-ink/20 bg-sheet p-3 text-sm whitespace-pre-wrap break-words">{p.bio}</p>}
      {!isMe && !blocked && (
        <div className="space-y-1">
          {mate && <p className="font-mono text-xs font-bold text-slate">一緒に遊んだ回数 {(mate as { times: number }).times}</p>}
          <FollowButton userId={id} initial={Boolean(follow)} />
        </div>
      )}
      <p className="text-xs text-slate">連絡先は、募集で参加が確定した相手にだけ表示されます。</p>
      {isMe ? (
        <Link href="/profile/edit" className="btn-outline w-full">プロフィールを編集</Link>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton
            action={blockUserAction.bind(null, id, !blocked)}
            className="btn-outline btn-sm"
            confirm={blocked ? 'ブロックを解除しますか？' : 'このユーザーをブロックしますか？ お互いの募集に参加できなくなり、相手の募集も表示されなくなります。'}
          >
            {blocked ? 'ブロック解除' : 'ブロック'}
          </ActionButton>
          <ReportButton targetType="user" targetId={id} small={false} />
          {!blocked && (
            <p className="w-full text-[13px] leading-relaxed text-slate">
              ブロックすると、お互いの募集に参加できなくなり、相手の募集とチャットの発言も表示されなくなります。相手には知らされません。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
