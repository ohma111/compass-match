import Link from 'next/link';
import { ChevronLeft, Lock, Share2 } from 'lucide-react';
import { canApprove, canRequestJoin, effectiveStatus, remainingSlots, seatLabel, type JoinState } from '@/lib/capacity';
import { formatJst, formatJstRange } from '@/lib/time';
import { PURPOSE_LABELS, RANK_LABELS, RANK_MIN_LABELS, RECRUIT_STATUS_LABELS } from '@/lib/constants';
import { seatsFor } from '@/lib/seats';
import { JoinModeBadge, MoodTags, PurposeBadge, VcBadge } from '@/components/Tags';
import { Countdown } from '@/components/Countdown';
import { LobbyLineup } from '@/components/LobbyLineup';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import type { AuthState } from '@/components/JoinButton';
import { ChatRoom } from '@/components/ChatRoom';
import { RoomCodePanel } from '@/components/RoomCodePanel';
import { IntentRunner } from '@/components/IntentRunner';
import { cancelParticipationAction, cancelRecruitmentAction, decideParticipationAction } from '@/app/actions';
import type { MemberContact, Message, Participation, Recruitment } from '@/lib/types';

export interface RecruitmentDetailViewProps {
  r: Recruitment;
  now: Date;
  auth: AuthState;
  viewerId: string | null;
  participations: Participation[];
  myState: JoinState;
  roomCode: string | null;
  contacts: MemberContact[];
  messages: Message[];
  src: string | null;
  created?: boolean;
  justJoined?: boolean;
  siteUrl: string;
}

/** X の投稿画面を開くだけのリンク (APIは使わない)。流入計測のため ?src=x を付ける */
function shareHref(r: Recruitment, base: string): string {
  const url = `${base}/recruitments/${r.id}?src=x`;
  const left = remainingSlots(r.capacity, r.approved_count);
  const text = `#コンパス ${PURPOSE_LABELS[r.purpose]}募集「${r.title}」\n${formatJst(r.starts_at)}〜${left > 0 ? ` あと${left}人` : ''}`;
  return `https://x.com/intent/post?${new URLSearchParams({ text, url }).toString()}`;
}

export function RecruitmentDetailView(props: RecruitmentDetailViewProps) {
  const { r, now, auth, viewerId, participations, myState, roomCode, contacts, messages, src } = props;
  const id = r.id;
  const status = effectiveStatus(r.status, r.ends_at, now);
  const isOwner = viewerId === r.owner_id;
  const signedIn = Boolean(viewerId);
  const isMember = signedIn && (isOwner || myState === 'approved');
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
  const left = remainingSlots(r.capacity, r.approved_count);
  const justJoined = Boolean(props.justJoined && myState === 'approved');
  const seats = seatsFor(r, {
    approved,
    viewerId,
    knowsMembers: signedIn,
    linkProfiles: signedIn,
    enterUserId: justJoined ? viewerId : null,
  });
  const stamp = justJoined ? (left === 0 ? '満員' : '参加確定') : null;

  return (
    <div>
      <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-bold text-slate hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        募集一覧
      </Link>

      <div className="mt-2 space-y-3">
        {props.created && (
          <div className="alert-ok space-y-1">
            <p className="font-bold">募集を出しました</p>
            <p className="text-[13px] font-normal text-ink-2">
              {r.join_mode === 'instant' ? '参加者が入ると通知でお知らせします。' : '参加申請が届くと通知でお知らせします。'}
              部屋番号は、参加した人にだけ表示されます。
            </p>
          </div>
        )}
        {r.hidden_at && <p className="alert-error">この募集は通報により一時的に非表示になっています。</p>}
        {auth === 'ready' && !isOwner && <IntentRunner recruitmentId={id} canJoin={join.ok} src={src} />}
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
        {/* 左: 募集の内容と席 */}
        <section aria-labelledby="r-title" className={`tone-${r.purpose}`}>
          <div className="flex items-center justify-between gap-3">
            <PurposeBadge purpose={r.purpose} size="md" />
            {!active && <span className="text-sm font-bold text-slate">{RECRUIT_STATUS_LABELS[status]}</span>}
          </div>
          <div className="mt-3">
            {active ? (
              <Countdown start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} size="xl" />
            ) : (
              <p className="font-display text-[40px] leading-none text-slate">{RECRUIT_STATUS_LABELS[status]}</p>
            )}
            <p className="mt-2 text-sm font-medium text-slate tabular-nums">{formatJstRange(r.starts_at, r.ends_at)}</p>
          </div>
          {/* 参加が確定した人がいちばん欲しいのは部屋番号なので、時刻のすぐ下に出す */}
          {isMember && (
            <div className="mt-5">
              <RoomCodePanel recruitmentId={id} code={roomCode} isOwner={isOwner} />
            </div>
          )}
          <h1 id="r-title" className="mt-4 text-[22px] leading-snug font-black break-words lg:text-[28px]">
            {r.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <JoinModeBadge mode={r.join_mode} />
            <VcBadge vc={r.vc} />
            {r.min_rank && <span className="text-xs font-bold text-ink-2">ランク条件 {RANK_MIN_LABELS[r.min_rank]}</span>}
            <MoodTags tags={r.tags} />
          </div>
          {r.note && <p className="mt-4 border-l-4 border-line bg-sheet p-3 text-sm whitespace-pre-wrap break-words">{r.note}</p>}

          <div className="mt-7">
            <LobbyLineup
              recruitmentId={id}
              seats={seats}
              label={seatLabel(r.capacity, r.approved_count)}
              capacity={r.capacity}
              occupied={Math.min(r.capacity, r.approved_count + 1)}
              left={left}
              joinMode={r.join_mode}
              auth={auth}
              canJoin={join.ok}
              reason={join.reason}
              isOwner={isOwner}
              joined={myState === 'approved'}
              src={src}
              stamp={stamp}
              live={active && !r.hidden_at}
            />
          </div>

          {!isOwner && (
            <div className="mt-2 space-y-2">
              {myState === 'pending' && <p className="text-center text-[13px] text-slate">募集者の承認を待っています。承認されると通知が届きます。</p>}
              {(myState === 'pending' || myState === 'approved') && active && (
                <ActionButton action={cancelParticipationAction.bind(null, id)} className="btn-ghost btn-sm w-full" confirm="参加を取り消しますか?">
                  {myState === 'pending' ? '申請を取り消す' : '参加をやめる'}
                </ActionButton>
              )}
            </div>
          )}

          {isOwner && active && approved.length > 0 && (
            <div className="mt-6 space-y-2">
              <h2 className="text-sm font-bold">参加者を外す</h2>
              <ul className="flex flex-wrap gap-2">
                {approved.map((p) => (
                  <li key={p.id}>
                    <ActionButton
                      action={decideParticipationAction.bind(null, id, p.id, 'rejected')}
                      className="btn-outline btn-sm"
                      confirm={`${p.profile?.display_name ?? 'この参加者'}さんを外しますか? 本人に通知されます。`}
                    >
                      {p.profile?.display_name ?? '参加者'}さんを外す
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 右: 参加した人だけが使うもの */}
        <div className="mt-10 space-y-6 lg:mt-0">
          {isOwner && (pending.length > 0 || r.join_mode === 'approval') && (
            <section className="space-y-3" aria-labelledby="requests-title">
              <h2 id="requests-title" className="section-title">
                参加申請 <span className="ml-1 font-sans text-sm font-bold text-slate">{pending.length}件</span>
              </h2>
              {pending.length === 0 && <p className="text-sm text-slate">承認待ちの申請はありません。</p>}
              <ul className="space-y-2">
                {pending.map((p) => (
                  <li key={p.id} className="sheet space-y-3 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/users/${p.user_id}`} className="truncate font-bold underline-offset-4 hover:underline">
                        {p.profile?.display_name ?? '(非表示のユーザー)'}
                      </Link>
                      {p.profile && <span className="shrink-0 text-xs text-slate">{RANK_LABELS[p.profile.rank_band]}</span>}
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

          {isMember ? (
            <>
              <section className="space-y-2" aria-labelledby="contacts-title">
                <h2 id="contacts-title" className="section-title">{isOwner ? '参加者の連絡先' : '募集者の連絡先'}</h2>
                {contacts.length === 0 && <p className="text-sm text-slate">登録されている連絡先はありません。</p>}
                <ul className="space-y-1.5 text-sm">
                  {contacts.map((c) => (
                    <li key={c.user_id} className="flex flex-wrap gap-x-3">
                      <span className="font-bold">{c.display_name}</span>
                      {c.contact_discord && <span className="break-all text-ink-2">Discord {c.contact_discord}</span>}
                      {c.contact_x && <span className="break-all text-ink-2">X @{c.contact_x}</span>}
                      {c.contact_ingame && <span className="break-all text-ink-2">ゲーム内 {c.contact_ingame}</span>}
                      {!c.contact_discord && !c.contact_x && !c.contact_ingame && <span className="text-slate">連絡先なし</span>}
                    </li>
                  ))}
                </ul>
              </section>
              <ChatRoom
                recruitmentId={id}
                viewerId={viewerId!}
                initialMessages={messages}
                names={Object.fromEntries(nameOf)}
                open={chatOpen && !restricted}
              />
            </>
          ) : (
            active && (
              <section className="bg-ink p-5 text-white" aria-labelledby="locked-title">
                <h2 id="locked-title" className="flex items-center gap-2 font-bold">
                  <Lock className="size-4" aria-hidden />
                  {myState === 'pending' ? '承認されると表示されます' : '参加すると表示されます'}
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm text-white/85">
                  <li>部屋番号 (コピーしてそのまま入れます)</li>
                  <li>メンバーだけのチャット</li>
                  <li>本人が登録した連絡先</li>
                </ul>
              </section>
            )
          )}

          <div className="space-y-2">
            {active && !r.hidden_at && (
              <a href={shareHref(r, props.siteUrl)} target="_blank" rel="noopener noreferrer" className="btn-outline w-full">
                <Share2 className="size-4" aria-hidden />
                Xで共有
              </a>
            )}
            {isOwner && active && (
              <ActionButton action={cancelRecruitmentAction.bind(null, id)} className="btn-danger w-full" confirm="この募集を取り消しますか? 参加者に通知されます。">
                募集を取り消す
              </ActionButton>
            )}
            {signedIn && !isOwner && (
              <div className="flex justify-end">
                <ReportButton targetType="recruitment" targetId={id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
