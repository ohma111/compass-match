import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecruitment } from '@/lib/queries';
import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { canApprove, canRequestJoin, effectiveStatus, seatLabel, type JoinState } from '@/lib/capacity';
import { formatJstRange, relativeStart } from '@/lib/time';
import { RANK_LABELS, RECRUIT_VC_LABELS, PROFILE_VC_LABELS } from '@/lib/constants';
import { MoodTags, PurposeChip, StatusBadge } from '@/components/Tags';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import { isRestricted } from '@/lib/auth';
import type { MemberContact, Message, Participation } from '@/lib/types';
import {
  cancelParticipationAction,
  cancelRecruitmentAction,
  decideParticipationAction,
  requestJoinAction,
} from '@/app/actions';
import { ChatRoom } from './ChatRoom';
import { RoomCodeEditor } from './RoomCodeEditor';

export const dynamic = 'force-dynamic';

export default async function RecruitmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const r = await getRecruitment(id).catch(() => null);
  if (!r) notFound();

  const viewer = await getViewerSafe();
  const supabase = await createClient();
  const now = new Date();
  const status = effectiveStatus(r.status, r.ends_at, now);
  const isOwner = viewer?.userId === r.owner_id;

  let participations: Participation[] = [];
  let myState: JoinState = 'none';
  let roomCode: string | null = null;
  let contacts: MemberContact[] = [];
  let messages: Message[] = [];

  if (viewer) {
    const { data } = await supabase
      .from('participations')
      .select('id, recruitment_id, user_id, status, created_at, profile:profiles!participations_user_id_fkey(id, display_name, rank_band, play_roles, vc, tags)')
      .eq('recruitment_id', id)
      .order('created_at', { ascending: true });
    participations = (data ?? []) as unknown as Participation[];
    myState = (participations.find((p) => p.user_id === viewer.userId)?.status as JoinState) ?? 'none';
  }
  const isMember = isOwner || myState === 'approved';

  if (viewer && isMember) {
    const [rc, ct, ms] = await Promise.all([
      supabase.rpc('get_room_code', { p_recruitment_id: id }),
      supabase.rpc('get_member_contacts', { p_recruitment_id: id }),
      supabase
        .from('messages')
        .select('id, recruitment_id, user_id, body, created_at')
        .eq('recruitment_id', id)
        .order('created_at', { ascending: true })
        .limit(200),
    ]);
    roomCode = (rc.data as string | null) ?? null;
    contacts = (ct.data as MemberContact[] | null) ?? [];
    messages = (ms.data as Message[] | null) ?? [];
  }

  const approved = participations.filter((p) => p.status === 'approved');
  const pending = participations.filter((p) => p.status === 'pending');
  const join = canRequestJoin({
    status: r.status,
    endsAt: r.ends_at,
    capacity: r.capacity,
    approvedCount: r.approved_count,
    isOwner,
    myState,
    now,
  });
  const approvable = canApprove(r.capacity, r.approved_count, r.status, r.ends_at, now);
  const restricted = isRestricted(viewer?.profile ?? null);
  const nameOf = new Map<string, string>();
  if (r.owner) nameOf.set(r.owner_id, r.owner.display_name);
  for (const p of approved) if (p.profile) nameOf.set(p.user_id, p.profile.display_name);
  const chatOpen = status !== 'ended' && status !== 'cancelled' && !r.hidden_at;

  return (
    <div className="space-y-5">
      {sp.created && <p className="alert-ok">募集を作成しました。参加申請が届くと通知でお知らせします。</p>}
      {r.hidden_at && <p className="alert-error">この募集は通報により一時的に非表示になっています。</p>}

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <PurposeChip purpose={r.purpose} />
          <StatusBadge status={status} />
          <span className="ml-auto text-xs font-bold text-muted">{relativeStart(r.starts_at, r.ends_at, now)}</span>
        </div>
        <h1 className="text-xl font-bold leading-snug">{r.title}</h1>
        <dl className="grid grid-cols-[6em_1fr] gap-y-1 text-sm">
          <dt className="text-muted">日時</dt>
          <dd>{formatJstRange(r.starts_at, r.ends_at)}</dd>
          <dt className="text-muted">人数</dt>
          <dd className="font-bold">{seatLabel(r.capacity, r.approved_count)}</dd>
          <dt className="text-muted">ランク帯</dt>
          <dd>{r.min_rank ? `${RANK_LABELS[r.min_rank]}以上` : '指定なし'}</dd>
          <dt className="text-muted">VC</dt>
          <dd>{RECRUIT_VC_LABELS[r.vc]}</dd>
          <dt className="text-muted">募集者</dt>
          <dd>
            {r.owner ? (
              <Link className="link" href={`/users/${r.owner_id}`}>{r.owner.display_name}</Link>
            ) : (
              '―'
            )}
            {r.owner && <span className="ml-1 text-xs text-muted">({RANK_LABELS[r.owner.rank_band]})</span>}
          </dd>
        </dl>
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <MoodTags tags={r.tags} />
          </div>
        )}
        {r.note && <p className="whitespace-pre-wrap break-words rounded-lg bg-bg p-3 text-sm">{r.note}</p>}

        {/* 参加ボタン */}
        {!viewer && (
          <Link href={`/login?next=${encodeURIComponent(`/recruitments/${id}`)}`} className="btn-primary w-full">
            ログインして参加申請する
          </Link>
        )}
        {viewer && !isOwner && (
          <div className="space-y-2">
            {join.ok && !restricted ? (
              <ActionButton action={requestJoinAction.bind(null, id, sp.src ?? null)} className="btn-primary w-full">
                参加したい
              </ActionButton>
            ) : (
              <p className="rounded-lg bg-bg p-3 text-center text-sm font-bold">{restricted ? '現在ご利用いただけません' : join.reason}</p>
            )}
            {(myState === 'pending' || myState === 'approved') && status !== 'ended' && (
              <ActionButton
                action={cancelParticipationAction.bind(null, id)}
                className="btn-outline btn-sm w-full"
                confirm="参加を取り消しますか?"
              >
                {myState === 'pending' ? '申請を取り消す' : '参加をやめる'}
              </ActionButton>
            )}
          </div>
        )}
        {isOwner && (status === 'open' || status === 'full') && (
          <ActionButton
            action={cancelRecruitmentAction.bind(null, id)}
            className="btn-danger btn-sm w-full"
            confirm="この募集を取り消しますか? 参加者に通知されます。"
          >
            募集を取り消す
          </ActionButton>
        )}
        {viewer && !isOwner && (
          <div className="flex justify-end">
            <ReportButton targetType="recruitment" targetId={id} />
          </div>
        )}
      </section>

      {/* 参加者 */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">参加者</h2>
        {approved.length === 0 && <p className="text-sm text-muted">まだ承認された参加者はいません。</p>}
        <ul className="space-y-2">
          {approved.map((p) => (
            <li key={p.id} className="card flex items-center gap-2 py-3">
              <Link href={`/users/${p.user_id}`} className="font-bold link">{p.profile?.display_name ?? '(非表示のユーザー)'}</Link>
              {p.profile && <span className="text-xs text-muted">{RANK_LABELS[p.profile.rank_band]}・{PROFILE_VC_LABELS[p.profile.vc]}</span>}
              {isOwner && (
                <div className="ml-auto">
                  <ActionButton
                    action={decideParticipationAction.bind(null, id, p.id, 'rejected')}
                    className="btn-outline btn-sm"
                    confirm="この参加者を外しますか?"
                  >
                    外す
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 承認待ち (募集者のみ) */}
      {isOwner && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">参加申請 ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-muted">承認待ちの申請はありません。</p>}
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="card space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/users/${p.user_id}`} className="font-bold link">{p.profile?.display_name ?? '(非表示のユーザー)'}</Link>
                  {p.profile && <span className="text-xs text-muted">{RANK_LABELS[p.profile.rank_band]}・{PROFILE_VC_LABELS[p.profile.vc]}</span>}
                </div>
                {p.profile && p.profile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1"><MoodTags tags={p.profile.tags} /></div>
                )}
                <div className="flex gap-2">
                  <ActionButton
                    action={decideParticipationAction.bind(null, id, p.id, 'approved')}
                    className="btn-primary btn-sm"
                  >
                    {approvable ? '承認する' : '承認する (満員)'}
                  </ActionButton>
                  <ActionButton action={decideParticipationAction.bind(null, id, p.id, 'rejected')} className="btn-outline btn-sm">
                    見送る
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 承認済みメンバー限定 */}
      {viewer && isMember && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">メンバー限定</h2>
          <div className="card space-y-2">
            <p className="text-sm text-muted">部屋番号</p>
            {isOwner ? (
              <RoomCodeEditor recruitmentId={id} initial={roomCode ?? ''} />
            ) : (
              <p className="text-2xl font-bold tracking-widest">{roomCode ?? '未設定 (募集者の入力をお待ちください)'}</p>
            )}
          </div>
          <div className="card space-y-2">
            <p className="text-sm text-muted">{isOwner ? '参加者の連絡先' : '募集者の連絡先'} (本人が公開を選んだもののみ)</p>
            {contacts.length === 0 && <p className="text-sm">表示できる連絡先はありません。</p>}
            <ul className="space-y-1 text-sm">
              {contacts.map((c) => (
                <li key={c.user_id}>
                  <span className="font-bold">{c.display_name}</span>
                  {c.is_owner && <span className="ml-1 text-xs text-muted">(募集者)</span>}
                  <span className="ml-2 break-all">
                    {[
                      c.contact_discord && `Discord: ${c.contact_discord}`,
                      c.contact_x && `X: @${c.contact_x}`,
                      c.contact_ingame && `ゲーム内: ${c.contact_ingame}`,
                    ]
                      .filter(Boolean)
                      .join(' / ') || '連絡先なし'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ChatRoom
            recruitmentId={id}
            viewerId={viewer.userId}
            initialMessages={messages}
            names={Object.fromEntries(nameOf)}
            open={chatOpen && !restricted}
          />
        </section>
      )}
    </div>
  );
}
