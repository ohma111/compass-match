import Link from '@/components/Link';
import { ChevronLeft, Lock } from 'lucide-react';
import { canApprove, canRequestJoin, effectiveStatus, remainingSlots, seatLabel, type JoinState } from '@/lib/capacity';
import { formatJst, formatJstRange, formatJstTime } from '@/lib/time';
import { STANCE_LABELS, PURPOSE_LABELS, rankLabel, RANK_MIN_LABELS, RECRUIT_STATUS_LABELS } from '@/lib/constants';
import { seatsFor } from '@/lib/seats';
import { DeckInfo, DuoAndRoles, JoinModeBadge, MoodTags, PurposeBadge, VcBadge } from '@/components/Tags';
import { TimeRail } from '@/components/TimeRail';
import { ShareButton } from '@/components/ShareButton';
import { JoinButton, joinExtraOf } from '@/components/JoinButton';
import { LobbyLineup } from '@/components/LobbyLineup';
import { ActionButton } from '@/components/ActionButton';
import { ReportButton } from '@/components/ReportButton';
import type { AuthState } from '@/components/JoinButton';
import { ChatRoom } from '@/components/ChatRoom';
import { RoomCodePanel } from '@/components/RoomCodePanel';
import { IntentRunner } from '@/components/IntentRunner';
import { cancelParticipationAction, cancelRecruitmentAction, decideParticipationAction, extendRecruitmentAction, keepRecruitmentAction, setDuoPlayingAction } from '@/app/actions';
import { CopyButton } from '@/components/CopyButton';
import type { MemberContact, Message, Participation, Recruitment, RoomInfo } from '@/lib/types';

export interface RecruitmentDetailViewProps {
  r: Recruitment;
  now: Date;
  auth: AuthState;
  viewerId: string | null;
  participations: Participation[];
  myState: JoinState;
  room: RoomInfo | null;
  /** この募集のチャットの通知を止めている */
  chatMuted?: boolean;
  /** 匿名のアカウント (引き継ぎコードをまだ作っていない) */
  anonymous?: boolean;
  contacts: MemberContact[];
  messages: Message[];
  src: string | null;
  created?: boolean;
  justJoined?: boolean;
  siteUrl: string;
  /** 自分がブロックしている人が募集者か参加者にいる */
  blockedHere?: boolean;
  /** ほかの募集に参加中・募集中 (参加の前に確かめる) */
  busyElsewhere?: boolean;
  /** 自分がブロックしている方 (チャットで発言を隠す) */
  blockedIds?: string[];
}

/** X の投稿画面を開くだけのリンク (APIは使わない)。流入計測のため ?src=x を付ける */
function shareData(r: Recruitment, base: string): { text: string; url: string } {
  const url = `${base}/recruitments/${r.id}?src=x`;
  const left = remainingSlots(r.capacity, r.approved_count);
  const text = `#コンパス ${PURPOSE_LABELS[r.purpose]}募集「${r.title}」\n${formatJst(r.starts_at)}〜${left > 0 ? ` あと${left}人` : ''}\n`;
  return { text, url };
}

export function RecruitmentDetailView(props: RecruitmentDetailViewProps) {
  const { r, now, auth, viewerId, participations, myState, room, contacts, messages, src } = props;
  const roomCode = room?.code ?? null;
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
  // チャットは参加が確定していなくても、プロフィールのある方なら使える (部屋番号はメンバーだけ)
  const chatVisible = isMember || (auth === 'ready' && active && !r.hidden_at);
  const left = remainingSlots(r.capacity, r.approved_count);
  // 開始から6時間までは延ばせる (DB の制約と同じ)
  // 2固定中にできる: バトルアリーナ・フリーバトルの3人募集で、参加者が1人以上
  const duoAble = (r.purpose === 'rank' || r.purpose === 'enjoy') && r.capacity === 3 && r.approved_count >= 1;
  const extendable = new Date(r.ends_at).getTime() < new Date(r.starts_at).getTime() + 6 * 3600_000;
  const justJoined = Boolean(props.justJoined && myState === 'approved');
  const seats = seatsFor(r, {
    approved,
    viewerId,
    knowsMembers: signedIn,
    linkProfiles: signedIn,
    enterUserId: justJoined ? viewerId : null,
  });
  const stamp = justJoined ? (left === 0 ? '満員' : '参加確定') : null;
  const roomPanel = (floating: boolean) => (
    <RoomCodePanel
      key={floating ? 'm' : 'd'}
      recruitmentId={id}
      code={roomCode}
      isOwner={isOwner}
      canEdit={active && !r.hidden_at}
      updatedAt={room?.updated_at ?? null}
      updatedByName={room?.updated_by ? (nameOf.get(room.updated_by) ?? null) : null}
      updatedByMe={Boolean(room?.updated_by && room.updated_by === viewerId)}
      floating={floating}
    />
  );

  const LOCKED = (
    <section className="border-2 border-dashed border-ink/50 p-5 text-ink-2" aria-label="メンバー限定">
      <p className="flex items-center gap-2 font-bold">
        <Lock className="size-4" aria-hidden />
        {myState === 'pending' ? '承認されると、部屋番号が表示されます' : '参加すると、部屋番号が表示されます'}
      </p>
    </section>
  );

  return (
    <div>
      <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-bold text-slate hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        募集一覧
      </Link>

      <div className="mt-2 space-y-3">
        {props.created && (
          <p className="alert-ok font-bold">募集を出しました</p>
        )}
        {r.hidden_at && <p className="alert-error">通報で非表示になっています</p>}
        {isOwner && active && r.close_check_at && (
          <section className="border-2 border-signal bg-sheet p-4" role="alert" aria-labelledby="close-check-title">
            <h2 id="close-check-title" className="text-[16px] font-black">募集を続けますか？</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {formatJstTime(new Date(new Date(r.close_check_at).getTime() + 5 * 60_000))} までに操作がないと、募集は取り消されます。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ActionButton action={keepRecruitmentAction.bind(null, id)} className="btn-primary w-full">
                続ける
              </ActionButton>
              <ActionButton action={cancelRecruitmentAction.bind(null, id)} className="btn-outline w-full">
                取り消す
              </ActionButton>
            </div>
          </section>
        )}
        {auth === 'ready' && !isOwner && <IntentRunner recruitmentId={id} canJoin={join.ok} src={src} />}
      </div>

      {/*
        PC の構成: 上段 = 募集の内容 (左) と、部屋番号 / 参加すると見られるもの (右)。
        中段 = 席の並びを横いっぱいに (この画面の主役)。下段 = 連絡先・申請 (左) とチャット (右)。
        スマホは上から順に1列 (部屋番号は時刻のすぐ下)。
      */}
      <div className="mt-4 grid gap-y-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-12">
        <section aria-labelledby="r-title" className="lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <p className="type-tag flex flex-wrap items-center gap-x-2 text-slate">
            <PurposeBadge purpose={r.purpose} />
            <span aria-hidden>/</span>
            <span className="tabular-nums">{formatJstRange(r.starts_at, r.ends_at)}</span>
            {!active && (
              <>
                <span aria-hidden>/</span>
                <span className="text-ink">{RECRUIT_STATUS_LABELS[status]}</span>
              </>
            )}
          </p>
          <div className="mt-2">
            {active ? (
              <TimeRail start={r.starts_at} end={r.ends_at} serverNow={now.toISOString()} size="xl" />
            ) : (
              <p className="type-poster text-[72px] text-ink/25 sm:text-[96px]">{RECRUIT_STATUS_LABELS[status]}</p>
            )}
          </div>
          {/* 参加が確定した人がいちばん欲しいのは部屋番号なので、スマホでは時刻のすぐ下に出す */}
          {isMember && (
            <div className="mt-6 lg:hidden">
              {roomPanel(true)}
            </div>
          )}
          <h1 id="r-title" className="mt-5 border-t-2 border-ink pt-4 text-[22px] leading-snug font-black break-words lg:text-[28px]">
            {r.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {r.stance && <span className="text-xs font-black">{STANCE_LABELS[r.stance]}</span>}
            <JoinModeBadge mode={r.join_mode} />
            <VcBadge vc={r.vc} />
            {r.min_rank && <span className="text-xs font-bold text-ink-2">ランク条件 {RANK_MIN_LABELS[r.min_rank]}</span>}
            <span className="inline-flex items-center gap-3 text-xs"><DuoAndRoles r={r} /></span>
            {r.duo_playing && <span className="bg-ink px-1.5 text-xs font-black text-white">2固定中</span>}
            <MoodTags tags={r.tags} />
          </div>
          <DeckInfo r={r} className="mt-2 text-[13px] text-ink-2" />
          {r.note && <p className="mt-4 border-2 border-ink/20 bg-sheet p-3 text-sm whitespace-pre-wrap break-words">{r.note}</p>}
        </section>

        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:block lg:self-start">
          {!isOwner && (
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
              hideWhenJoined
              warnBlocked={Boolean(props.blockedHere)}
              minRank={r.min_rank}
              vcOn={r.vc === 'on'}
              extra={joinExtraOf(r, Boolean(props.busyElsewhere))}
            />
          )}
          {isMember ? roomPanel(false) : active && LOCKED}
          {active && !r.hidden_at && (
            <ShareButton {...shareData(r, props.siteUrl)} className="btn-outline w-full" />
          )}
          {signedIn && !isOwner && (
            <div className="flex justify-end">
              <ReportButton targetType="recruitment" targetId={id} />
            </div>
          )}
        </aside>

        <section className="lg:col-span-7 lg:col-start-1 lg:row-start-2" aria-label="パーティの席">
          {props.blockedHere && (
            <p className="alert-error mb-4" role="status">
              ブロックしている方がこの募集にいます。{myState === 'approved' ? '参加を取り消す場合は、下の「参加を取り消す」を押してください。' : ''}
            </p>
          )}
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
            warnBlocked={Boolean(props.blockedHere)}
            minRank={r.min_rank}
              vcOn={r.vc === 'on'}
              extra={joinExtraOf(r, Boolean(props.busyElsewhere))}
          />
          {!isOwner && (
            <div className="mt-2 space-y-2 lg:mx-auto lg:max-w-md">
              {myState === 'pending' && <p className="text-center text-[13px] text-slate">募集者の承認待ちです</p>}
              {(myState === 'pending' || myState === 'approved') && active && (
                <ActionButton
                  action={cancelParticipationAction.bind(null, id)}
                  className="btn-outline w-full"
                  confirm={myState === 'pending' ? '申請を取り消しますか？' : 'この募集から抜けますか？ 部屋番号とチャットが見られなくなります。'}
                >
                  {myState === 'pending' ? '申請を取り消す' : '参加をやめて抜ける'}
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
                      confirm={`${p.profile?.display_name ?? 'この参加者'}さんを外しますか？`}
                    >
                      {p.profile?.display_name ?? '参加者'}さんを外す
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {!isMember && active && <div className="lg:hidden">{LOCKED}</div>}

        <div className={`space-y-8 ${isMember ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
          {isOwner && (pending.length > 0 || r.join_mode === 'approval') && (
            <section className="space-y-3" aria-labelledby="requests-title">
              <h2 id="requests-title" className="section-title">
                参加申請 <span className="ml-1 font-sans text-sm font-bold text-slate">{pending.length}件</span>
              </h2>
              {pending.length === 0 && <p className="text-sm text-slate">まだありません</p>}
              <ul className="space-y-2">
                {pending.map((p) => (
                  <li key={p.id} className="sheet space-y-3 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/users/${p.user_id}?from=${id}`} className="truncate font-bold underline-offset-4 hover:underline">
                        {p.profile?.display_name ?? '(非表示のユーザー)'}
                      </Link>
                      {p.profile && <span className="shrink-0 text-xs text-slate">{rankLabel(p.profile.rank_band)}</span>}
                    </div>
                    {p.deck_level != null && (
                      <p className="text-[13px] font-bold">デキレ{p.deck_level}・コラボ{p.collab}</p>
                    )}
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
          {isMember && active && props.anonymous && (
            <section className="border-2 border-ink p-4" aria-labelledby="keep-title">
              <h2 id="keep-title" className="text-[15px] font-black">この部屋に別の端末やアプリから戻るには</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                今のプロフィールは、このブラウザにだけ保存されています。X や Discord のアプリ内ブラウザ、ホーム画面に追加したアプリで開くと、別の人として扱われます。引き継ぎコードを作っておくと、どこからでもログインして戻れます。
              </p>
              <Link href="/me#transfer-title" className="btn-primary mt-3 w-full">
                引き継ぎコードを作る
              </Link>
            </section>
          )}
          {isMember && (
            <section className="space-y-2" aria-labelledby="contacts-title">
              <h2 id="contacts-title" className="section-title">{isOwner ? '参加者の連絡先' : '募集者の連絡先'}</h2>
              {contacts.length === 0 && <p className="text-sm text-slate">ありません</p>}
              {contacts.some((c) => c.contact_discord && c.user_id !== viewerId) && (
                <p className="text-[12px] text-slate">Discord のフレンド追加: アプリの「フレンドに追加」に、コピーしたユーザー名を貼り付けてください。</p>
              )}
              <ul className="space-y-1 text-sm">
                {contacts.map((c) => (
                  <li key={c.user_id} className="flex flex-wrap gap-x-3">
                    <span className="font-bold">{c.display_name}</span>
                    {c.contact_discord && (
                      <span className="inline-flex flex-wrap items-center gap-2 break-all text-ink-2">
                        Discord {c.contact_discord}
                        {c.user_id !== viewerId && <CopyButton text={c.contact_discord} label="ユーザー名をコピー" small />}
                      </span>
                    )}
                    {c.contact_x && <span className="break-all text-ink-2">X @{c.contact_x}</span>}
                    {c.contact_ingame && <span className="break-all text-ink-2">ゲーム内 {c.contact_ingame}</span>}
                    {!c.contact_discord && !c.contact_x && !c.contact_ingame && <span className="text-slate">連絡先は登録されていません</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className={`flex flex-col gap-2 ${isMember ? '' : 'lg:flex-row lg:items-center lg:justify-end'}`}>
            {active && !r.hidden_at && (
              <ShareButton {...shareData(r, props.siteUrl)} className="btn-outline w-full lg:hidden" />
            )}
            {isOwner && active && duoAble && (
              <ActionButton action={setDuoPlayingAction.bind(null, id, !r.duo_playing)} className={r.duo_playing ? 'btn-outline w-full' : 'btn-primary w-full'}>
                {r.duo_playing ? '2固定中を外す' : '2固定中にする (2人で遊びながら@1を待つ)'}
              </ActionButton>
            )}
            {isOwner && active && extendable && (
              <div className="space-y-1">
                <p className="text-[13px] font-bold">募集の時間を延ばす <span className="font-medium text-slate">(今は {formatJstTime(r.ends_at)} まで)</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton action={extendRecruitmentAction.bind(null, id, 30)} className="btn-outline w-full">
                    30分延長
                  </ActionButton>
                  <ActionButton action={extendRecruitmentAction.bind(null, id, 60)} className="btn-outline w-full">
                    1時間延長
                  </ActionButton>
                </div>
              </div>
            )}
            {isOwner && active && (
              <ActionButton action={cancelRecruitmentAction.bind(null, id)} className="btn-danger w-full" confirm="募集を取り消しますか？ 参加者にも通知されます。">
                募集を取り消す
              </ActionButton>
            )}
            {signedIn && !isOwner && (
              <div className="flex justify-end lg:hidden">
                <ReportButton targetType="recruitment" targetId={id} />
              </div>
            )}
          </div>
        </div>

        {chatVisible && (
          <div className="lg:col-span-7">
            <ChatRoom
              recruitmentId={id}
              viewerId={viewerId!}
              initialMessages={messages}
              names={{ ...Object.fromEntries(messages.flatMap((m) => (m.author ? [[m.user_id, m.author.display_name]] : []))), ...Object.fromEntries(nameOf) }}
              member={isMember}
              blockedIds={props.blockedIds ?? []}
              open={chatOpen && !restricted}
              muted={Boolean(props.chatMuted)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
