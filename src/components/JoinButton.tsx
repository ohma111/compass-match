'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Hand, Zap } from 'lucide-react';
import { requestJoinAction } from '@/app/actions';
import { authGateHref, saveIntent } from '@/lib/intent';
import { joinButtonLabel } from '@/lib/capacity';
import type { JoinMode } from '@/lib/constants';
import { RankPrompt } from './RankPrompt';

export type AuthState = 'guest' | 'no-profile' | 'ready' | 'restricted' | 'needs-rank';

export interface JoinControl {
  join: () => void;
  pending: boolean;
  error: string | null;
  done: string | null;
  /** ランク帯を聞いている途中 */
  asking: boolean;
  /** ランク帯を選んだあとに呼ぶ (そのまま参加する) */
  afterRank: () => void;
}

/**
 * 参加の処理。未ログインなら押した操作を記録して登録/ログインへ進み、
 * そのあと詳細ページで自動的に参加を再開する (IntentRunner)。
 * 文字のボタンと、ロビーの空き席の両方から同じものを使う。
 */
export function useJoin(recruitmentId: string, auth: AuthState, src?: string | null, opts: { compact?: boolean } = {}): JoinControl {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [rankOk, setRankOk] = useState(false);
  const detail = `/recruitments/${recruitmentId}`;

  function join() {
    if (pending) return;
    setError(null);
    if (auth === 'guest' || auth === 'no-profile') {
      saveIntent({ kind: 'join', recruitmentId });
      router.push(authGateHref(auth, detail));
      return;
    }
    // 初めての参加: ランク帯を1タップで選んでから続ける (一覧のカードは狭いので詳細で聞く)
    if (auth === 'needs-rank' && !rankOk) {
      if (opts.compact) {
        saveIntent({ kind: 'join', recruitmentId });
        router.push(detail);
        return;
      }
      setAsking(true);
      return;
    }
    doJoin();
  }

  function afterRank() {
    setRankOk(true);
    setAsking(false);
    doJoin();
  }

  function doJoin() {
    start(async () => {
      const r = await requestJoinAction(recruitmentId, src ?? null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data?.joined) {
        router.push(`${detail}?joined=1`);
      } else {
        setDone('申請しました・承認待ち');
        router.refresh();
      }
    });
  }
  return { join, pending, error, done, asking, afterRank };
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
}) {
  const own = useJoin(props.recruitmentId, props.auth, props.src, { compact: props.compact });
  const { join, pending, error, done, asking, afterRank } = props.control ?? own;
  const { recruitmentId, joinMode, auth, canJoin, reason, isOwner, joined, size = 'md', hideWhenJoined = false } = props;
  const detail = `/recruitments/${recruitmentId}`;
  const sizing = size === 'lg' ? 'btn-lg w-full text-base' : props.compact ? 'w-full min-h-12 px-2 text-[14px]' : 'w-full min-h-12 text-[15px]';

  if (joined && hideWhenJoined) return null;
  if (isOwner || joined) {
    return (
      <Link href={detail} className={`btn-outline ${sizing}`}>
        {props.compact ? (isOwner ? '管理する' : '参加中') : isOwner ? '自分の募集をひらく' : '参加中・部屋番号を見る'}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    );
  }
  if (done) {
    return <p className={`btn border-2 border-ok bg-sheet text-ok ${sizing}`} role="status">{done}</p>;
  }
  if (!canJoin || auth === 'restricted') {
    return (
      <p className={`btn hatch text-ink-2 ${sizing}`} aria-disabled="true">
        {auth === 'restricted' ? '現在ご利用いただけません' : reason}
      </p>
    );
  }

  const Icon = joinMode === 'instant' ? Zap : Hand;
  if (asking) return <RankPrompt verb={joinMode === 'instant' ? '参加' : '申請'} onConfirmed={afterRank} />;
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={join} disabled={pending} className={`btn-primary ${sizing}`}>
        <Icon className="size-5" aria-hidden />
        {pending ? '処理中…' : joinButtonLabel(joinMode)}
      </button>
      {error && (
        <p className="text-[13px] font-medium text-signal-deep" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
