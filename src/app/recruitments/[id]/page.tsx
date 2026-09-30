import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Crown, Share2 } from 'lucide-react';
import { getRecruitment } from '@/lib/queries';
import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { canApprove, canRequestJoin, effectiveStatus, remainingSlots, type JoinState } from '@/lib/capacity';
import { formatJst, formatJstRange } from '@/lib/time';
import { PURPOSE_LABELS, RANK_LABELS, RANK_MIN_LABELS, RECRUIT_STATUS_LABELS } from '@/lib/constants';
import { siteUrl } from '@/lib/env';
import { authStateOf } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { JoinModeBadge, MoodTags, PurposeBadge, VcBadge } from '@/components/Tags';
import { SlotDots } from '@/components/SlotDots';
import { Countdown } from '@/components/Countdown';
import { Avatar, EmptySeat } from '@/components/Avatar';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import { JoinButton } from '@/components/JoinButton';
import type { MemberContact, Message, Participation, Recruitment } from '@/lib/types';
import { cancelParticipationAction, cancelRecruitmentAction, decideParticipationAction } from '@/app/actions';
import { ChatRoom } from './ChatRoom';
import { RoomCodePanel } from './RoomCodePanel';
import { IntentRunner } from './IntentRunner';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const r = await getRecruitment(id).catch(() => null);
  return r ? { title: r.title } : {};
}

/** X の投稿画面を開くだけのリンク (APIは使わない)。流入計測のため ?src=x を付ける */
function shareHref(r: Recruitment): string {
  const url = `${siteUrl()}/recruitments/${r.id}?src=x`;
  const left = remainingSlots(r.capacity, r.approved_count);
  const text = `#コンパス ${PURPOSE_LABELS[r.purpose]}募集「${r.title}」\n${formatJst(r.starts_at)}〜${left > 0 ? ` あと${left}人` : ''}`;
  return `https://x.com/intent/post?${new URLSearchParams({ text, url }).toString()}`;
}

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
  const auth = authStateOf(viewer);
  const supabase = await createClient();
  const now = new Date();
  const status = effectiveStatus(r.status, r.ends_at, now);
  const isOwner = viewer?.userId === r.owner_id;
  const src = sanitizeSrc(sp.src);

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
  const isMember = Boolean(viewer) && (isOwner || myState === 'approved');

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
  const restricted = auth === 'restricted';
  const nameOf = new Map<string, string>();
  if (r.owner) nameOf.set(r.owner_id, r.owner.display_name);
  for (const p of approved) if (p.profile) nameOf.set(p.user_id, p.profile.display_name);
  const active = status === 'open' || status === 'full';
  const chatOpen = active && !r.hidden_at;
  // 参加者一覧は未ログインでは読めないため、人数だけを匿名の枠で表示する
  const anonymousFilled = viewer ? 0 : r.approved_count;
  const emptySeats = remainingSlots(r.capacity, r.approved_count);

  return (
    <div className="space-y-5">
      <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-bold text-muted">
        <ChevronLeft className="size-4" aria-hidden />
        募集一覧
      </Link>

      {sp.created && (
        <div className="alert-ok space-y-2">
          <p className="font-bold">募集を出しました!</p>
          <p className="text-xs">
            {r.join_mode === 'instant' ? '参加者が入ると通知でお知らせします。' : '参加申請が届くと通知でお知らせします。'}
            Xで共有すると人が集まりやすくなります。
          </p>
        </div>
      )}
      {sp.joined && myState === 'approved' && <p className="alert-ok font-bold">参加しました! 部屋番号とチャットが使えます。</p>}
      {r.hidden_at && <p className="alert-error">この募集は通報により一時的に非表示になっています。</p>}
      {auth === 'ready' && !isOwner && <IntentRunner recruitmentId={id} canJoin={join.ok} src={src} />}

      {/* 概要 */}
      <section className={`tone-${r.purpose} relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5`}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[var(--tone)] shadow-[0_0_18px_var(--tone)]" />
        <div className="flex items-center justify-between gap-2">
          <PurposeBadge purpose={r.purpose} size="md" />
          {active ? (
            <Countdown start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} large />
          ) : (
            <span className="text-sm font-extrabold text-muted">{RECRUIT_STATUS_LABELS[status]}</span>
          )}
        </div>
        <h1 className="mt-3 text-2xl leading-snug font-extrabold break-words">{r.title}</h1>
        <p className="mt-1 text-sm text-muted tabular-nums">{formatJstRange(r.starts_at, r.ends_at)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SlotDots capacity={r.capacity} approvedCount={r.approved_count} />
          <JoinModeBadge mode={r.join_mode} />
          <VcBadge vc={r.vc} withLabel />
          {r.min_rank && <span className="text-xs font-bold text-muted">ランク条件 {RANK_MIN_LABELS[r.min_rank]}</span>}
        </div>
        {r.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <MoodTags tags={r.tags} />
          </div>
        )}
        {r.note && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words">{r.note}</p>}

        {!isOwner && (
          <div className="mt-5 space-y-2">
            <JoinButton
              recruitmentId={id}
              joinMode={r.join_mode}
              auth={auth}
              canJoin={join.ok}
              reason={join.reason}
              isOwner={false}
              joined={myState === 'approved'}
              src={src}
              size="lg"
            />
            {myState === 'pending' && <p className="text-center text-xs text-muted">募集者の承認を待っています。承認されると通知が届きます。</p>}
            {(myState === 'pending' || myState === 'approved') && active && (
              <ActionButton
                action={cancelParticipationAction.bind(null, id)}
                className="btn-ghost btn-sm w-full"
                confirm="参加を取り消しますか?"
              >
                {myState === 'pending' ? '申請を取り消す' : '参加をやめる'}
              </ActionButton>
            )}
          </div>
        )}
      </section>

      {/* メンバー枠 */}
      <section className="space-y-2" aria-labelledby="members-title">
        <h2 id="members-title" className="section-title">
          MEMBERS <span className="ml-1 tracking-normal">{Math.min(r.capacity, r.approved_count + 1)}/{r.capacity}</span>
        </h2>
        <ul className="card divide-y divide-line/70 p-0">
          <li className="flex min-h-16 items-center gap-3 px-4 py-2.5">
            <Avatar name={r.owner?.display_name ?? '?'} seed={r.owner_id} ring />
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-bold">
                {r.owner && viewer ? (
                  <Link href={`/users/${r.owner_id}`} className="truncate hover:underline">{r.owner.display_name}</Link>
                ) : (
                  <span className="truncate">{r.owner?.display_name ?? '―'}</span>
                )}
                <Crown className="size-4 shrink-0 text-brand" aria-label="募集者" />
              </p>
              {r.owner && <p className="text-xs text-muted">募集者・{RANK_LABELS[r.owner.rank_band]}</p>}
            </div>
          </li>
          {approved.map((p) => (
            <li key={p.id} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
              <Avatar name={p.profile?.display_name ?? '?'} seed={p.user_id} />
              <div className="min-w-0 flex-1">
                <Link href={`/users/${p.user_id}`} className="block truncate font-bold hover:underline">
                  {p.profile?.display_name ?? '(非表示のユーザー)'}
                  {p.user_id === viewer?.userId && <span className="ml-1 text-xs text-brand">(あなた)</span>}
                </Link>
                {p.profile && <p className="text-xs text-muted">{RANK_LABELS[p.profile.rank_band]}</p>}
              </div>
              {isOwner && active && (
                <ActionButton
                  action={decideParticipationAction.bind(null, id, p.id, 'rejected')}
                  className="btn-outline btn-sm"
                  confirm={`${p.profile?.display_name ?? 'この参加者'}さんを外しますか? 本人に通知されます。`}
                >
                  外す
                </ActionButton>
              )}
            </li>
          ))}
          {Array.from({ length: anonymousFilled }, (_, i) => (
            <li key={`anon-${i}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
              <Avatar name="?" seed={`${r.id}-${i}`} />
              <p className="text-sm font-bold text-muted">参加者</p>
            </li>
          ))}
          {Array.from({ length: emptySeats }, (_, i) => (
            <li key={`empty-${i}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
              <EmptySeat />
              <p className="text-sm text-muted">空き</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 承認待ち (募集者のみ) */}
      {isOwner && (pending.length > 0 || r.join_mode === 'approval') && (
        <section className="space-y-2" aria-labelledby="requests-title">
          <h2 id="requests-title" className="section-title">
            REQUESTS <span className="ml-1 tracking-normal">{pending.length}</span>
          </h2>
          {pending.length === 0 && <p className="card text-sm text-muted">承認待ちの申請はありません。</p>}
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="card space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.profile?.display_name ?? '?'} seed={p.user_id} />
                  <div className="min-w-0">
                    <Link href={`/users/${p.user_id}`} className="block truncate font-bold hover:underline">
                      {p.profile?.display_name ?? '(非表示のユーザー)'}
                    </Link>
                    {p.profile && <p className="text-xs text-muted">{RANK_LABELS[p.profile.rank_band]}</p>}
                  </div>
                </div>
                {p.profile && p.profile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5"><MoodTags tags={p.profile.tags} /></div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton action={decideParticipationAction.bind(null, id, p.id, 'approved')} className="btn-primary w-full">
                    {approvable ? '承認する' : '満員'}
                  </ActionButton>
                  <ActionButton action={decideParticipationAction.bind(null, id, p.id, 'rejected')} className="btn-outline w-full">
                    見送る
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 参加が確定したメンバー限定 */}
      {viewer && isMember && (
        <>
          <RoomCodePanel recruitmentId={id} code={roomCode} isOwner={isOwner} />
          <section className="card space-y-2" aria-labelledby="contacts-title">
            <h2 id="contacts-title" className="text-sm font-extrabold">
              {isOwner ? '参加者の連絡先' : '募集者の連絡先'}
              <span className="ml-1 text-xs font-normal text-muted">(本人が登録したもののみ)</span>
            </h2>
            {contacts.length === 0 && <p className="text-sm text-muted">表示できる連絡先はありません。</p>}
            <ul className="space-y-1.5 text-sm">
              {contacts.map((c) => (
                <li key={c.user_id}>
                  <span className="font-bold">{c.display_name}</span>
                  <span className="ml-2 break-all text-muted">
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
          </section>
          <ChatRoom
            recruitmentId={id}
            viewerId={viewer.userId}
            initialMessages={messages}
            names={Object.fromEntries(nameOf)}
            open={chatOpen && !restricted}
          />
        </>
      )}

      {/* 共有・管理 */}
      <section className="space-y-2">
        {active && !r.hidden_at && (
          <a href={shareHref(r)} target="_blank" rel="noopener noreferrer" className="btn-outline w-full">
            <Share2 className="size-4" aria-hidden />
            Xで共有
          </a>
        )}
        {isOwner && active && (
          <ActionButton
            action={cancelRecruitmentAction.bind(null, id)}
            className="btn-danger w-full"
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
    </div>
  );
}
