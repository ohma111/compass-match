'use client';
import { useState, useTransition } from 'react';
import Link from '@/components/Link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Hand, Zap } from 'lucide-react';
import { requestJoinAction } from '@/app/actions';
import { joinButtonLabel } from '@/lib/capacity';
import { meetsMinRank, RANK_MIN_LABELS, type JoinMode, type RankBand } from '@/lib/constants';
import { useEnsureProfile } from './ProfileSheet';
import { useCurrentRank, useEnsureRank, useRankNow } from './RankSheet';
import { useEnsureDiscord } from './DiscordSheet';
import { useJoinAsk, type DeckAnswer } from './JoinAskSheet';
import type { Recruitment } from '@/lib/types';

export type AuthState = 'guest' | 'no-profile' | 'ready' | 'restricted';

export interface JoinControl {
  join: () => void;
  pending: boolean;
  error: string | null;
  done: string | null;
}

/**
 * 参加の処理。未ログインなら押した操作を記録して登録/ログインへ進み、
 * そのあと詳細ページで自動的に参加を再開する (IntentRunner)。
 * 文字のボタンと、ロビーの空き席の両方から同じものを使う。
 */
/** v15: デキレを聞く募集の条件と、ほかの募集に参加中・募集中か */
export interface JoinExtra {
  deck?: { minDeck: number | null; minCollab: number | null } | null;
  busyElsewhere?: boolean;
}

/** 募集から JoinExtra を作る */
export function joinExtraOf(r: Pick<Recruitment, 'owner_deck_level' | 'min_deck_level' | 'min_collab'>, busyElsewhere = false): JoinExtra {
  return {
    deck: r.owner_deck_level != null ? { minDeck: r.min_deck_level ?? null, minCollab: r.min_collab ?? null } : null,
    busyElsewhere,
  };
}

export function useJoin(recruitmentId: string, auth: AuthState, src?: string | null, minRank?: RankBand | null, vcOn = false, extra: JoinExtra = {}): JoinControl {
  const ask = useJoinAsk();
  const router = useRouter();
  const ensureProfile = useEnsureProfile();
  const ensureRank = useEnsureRank();
  const rankNow = useRankNow();
  const ensureDiscord = useEnsureDiscord();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState(false);
  const detail = `/recruitments/${recruitmentId}`;

  async function join() {
    if (pending) return;
    setError(null);
    // v4: 初めての人はその場のシートでプロフィールを作り、ページを移らずにそのまま参加する
    if ((auth === 'guest' || auth === 'no-profile') && !profileOk) {
      const ok = await ensureProfile('参加');
      if (!ok) return;
      setProfileOk(true);
    }
    // ランクは初めて参加するときに聞く
    if (!(await ensureRank())) return;
    // ランク条件より下の方は参加できない (DB でも止めている)
    if (!meetsMinRank(rankNow(), minRank)) {
      setError(`ランク条件 (${RANK_MIN_LABELS[minRank!]}) を満たしていないため、参加できません`);
      return;
    }
    // ほかの募集に参加中・募集中なら確かめる (止めはしない)
    if (extra.busyElsewhere && !(await ask.confirm('ほかの募集に参加中か、募集を出しています。こちらにも参加しますか？', '参加する'))) return;
    // VC ありの募集は Discord のユーザー名を先に聞く
    if (vcOn && !(await ensureDiscord())) return;
    // バトルアリーナの承認制は、デキレとコラボ数を聞く
    let deck: DeckAnswer | null = null;
    if (extra.deck) {
      deck = await ask.deck(extra.deck);
      if (!deck) return;
    }
    doJoin(deck);
  }

  function doJoin(deck: DeckAnswer | null) {
    start(async () => {
      const r = await requestJoinAction(recruitmentId, src ?? null, deck);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data?.joined) {
        router.push(`${detail}?joined=1`);
      } else {
        setDone('申請しました');
        router.refresh();
      }
    });
  }
  return { join: () => void join(), pending, error, done };
}

/** 「参加する」ボタン */
export function JoinButton(props: {
  recruitmentId: string;
  joinMode: JoinMode;
  auth: AuthState;
  canJoin: boolean;
  reason?: string;
  isOwner: boolean;
  joined: boolean;
  src?: string | null;
  size?: 'md' | 'lg';
  /** 詳細ページでは参加済みならボタンを出さない (同じページへのリンクになるため) */
  hideWhenJoined?: boolean;
  /** 空き席と状態を共有するとき (ロビー) */
  control?: JoinControl;
  /** 一覧のカード内で、席の横に置く短い表示 */
  compact?: boolean;
  /** 自分がブロックしている人がいる募集: 押したらもう一度確かめる */
  warnBlocked?: boolean;
  /** 募集のランク条件 */
  minRank?: RankBand | null;
  /** VC ありの募集 (参加のとき Discord のユーザー名を聞く) */
  vcOn?: boolean;
  extra?: JoinExtra;
}) {
  const own = useJoin(props.recruitmentId, props.auth, props.src, props.minRank, props.vcOn, props.extra);
  const myRank = useCurrentRank();
  const { join, pending, error, done } = props.control ?? own;
  const [confirming, setConfirming] = useState(false);
  const { recruitmentId, joinMode, auth, canJoin, reason, isOwner, joined, size = 'md', hideWhenJoined = false } = props;
  const detail = `/recruitments/${recruitmentId}`;
  const sizing = size === 'lg' ? 'btn-lg w-full text-base' : props.compact ? 'w-full min-h-12 px-2 text-[14px]' : 'w-full min-h-12 text-[15px]';

  if (joined && hideWhenJoined) return null;
  if (isOwner || joined) {
    return (
      <Link href={detail} className={`btn-outline ${sizing}`}>
        {props.compact ? (isOwner ? '管理する' : '参加中') : isOwner ? '自分の募集を開く' : '参加中・部屋番号を見る'}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    );
  }
  if (done) {
    return <p className={`btn border-2 border-ok bg-sheet text-ok ${sizing}`} role="status">{props.compact ? '承認待ち' : '申請しました。承認をお待ちください'}</p>;
  }
  // ランクが分かっていて条件に届かないときは、最初から押せなくする
  const rankShort = canJoin && props.minRank && myRank && !meetsMinRank(myRank, props.minRank);
  if (!canJoin || auth === 'restricted' || rankShort) {
    return (
      <p className={`btn hatch text-ink-2 ${sizing}`} aria-disabled="true">
        {auth === 'restricted' ? '現在ご利用いただけません' : rankShort ? `${RANK_MIN_LABELS[props.minRank!]}の募集です` : reason}
      </p>
    );
  }

  const Icon = joinMode === 'instant' ? Zap : Hand;
  if (confirming) {
    return (
      <div className="space-y-1.5" role="alertdialog" aria-label="ブロックしている方がいます">
        <p className="text-[12px] leading-snug font-bold text-signal-deep">ブロックしている方がいます。参加しますか？</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => { setConfirming(false); join(); }} disabled={pending} className={`btn-primary flex-1 ${props.compact ? 'min-h-11 px-1 text-[13px]' : ''}`}>
            参加する
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`btn-outline flex-1 ${props.compact ? 'min-h-11 px-1 text-[13px]' : ''}`}>
            やめる
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => (props.warnBlocked ? setConfirming(true) : join())} disabled={pending} className={`btn-primary group ${sizing}`}>
        {!props.compact && <Icon className="size-5" aria-hidden />}
        {pending ? '処理中…' : joinButtonLabel(joinMode)}
        {props.compact && !pending && (
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
        )}
      </button>
      {error && (
        <p className="text-[13px] font-medium text-signal-deep" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
