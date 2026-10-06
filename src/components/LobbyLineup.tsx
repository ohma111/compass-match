'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lineup, type Seat } from './Lineup';
import { JoinButton, useJoin, type AuthState } from './JoinButton';
import { meetsMinRank, type JoinMode, type RankBand } from '@/lib/constants';
import { useCurrentRank } from './RankSheet';

/** 席の状態を見に行く間隔 (画面が見えているときだけ) */
const LIVE_REFRESH_MS = 15_000;

/**
 * 募集詳細の「ロビー」。
 * - 最初の空き席そのものが参加ボタン (文字の「参加する」ボタンも下に残す)
 * - 開いている間は15秒ごとに更新し、誰かが入ると、その席が滑り込んで一瞬光る
 * - 自分の参加が確定した直後は「参加確定」/「満員」の判を見出しの横に押す
 */
export function LobbyLineup(props: {
  recruitmentId: string;
  seats: Seat[];
  label: string;
  capacity: number;
  occupied: number;
  left: number;
  joinMode: JoinMode;
  auth: AuthState;
  canJoin: boolean;
  reason?: string;
  isOwner: boolean;
  joined: boolean;
  src?: string | null;
  stamp?: string | null;
  live: boolean;
  warnBlocked?: boolean;
  minRank?: RankBand | null;
  vcOn?: boolean;
}) {
  const router = useRouter();
  const myRank = useCurrentRank();
  const control = useJoin(props.recruitmentId, props.auth, props.src, props.minRank, props.vcOn);
  const prevOccupied = useRef(props.occupied);
  const [entering, setEntering] = useState<number[]>([]);

  // 誰かが入ったら、その席だけ動かす
  useEffect(() => {
    const before = prevOccupied.current;
    prevOccupied.current = props.occupied;
    if (props.occupied <= before) return;
    setEntering(Array.from({ length: props.occupied - before }, (_, k) => before + k));
    const t = setTimeout(() => setEntering([]), 1200);
    return () => clearTimeout(t);
  }, [props.occupied]);

  // 席の自動更新。開いた直後は15秒ごと、触らずに置いてあるほど間隔を空ける (無料枠の通信量を抑える)。
  // 画面が見えていないときは更新せず、戻ってきたら1回だけすぐ更新する。
  useEffect(() => {
    if (!props.live) return;
    let last = Date.now();
    let timer: number;
    const touch = () => {
      last = Date.now();
    };
    const interval = () => {
      const idle = Date.now() - last;
      return idle < 5 * 60_000 ? LIVE_REFRESH_MS : idle < 20 * 60_000 ? 45_000 : 120_000;
    };
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
      timer = window.setTimeout(tick, interval());
    };
    timer = window.setTimeout(tick, interval());
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      touch();
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [props.live, router]);

  const seats = props.seats.map((s, i) => (entering.includes(i) ? { ...s, enter: true } : s));
  const seatJoin =
    !props.isOwner && !props.joined && props.canJoin && props.auth !== 'restricted' && !control.done && !props.warnBlocked && !(props.minRank && myRank && !meetsMinRank(myRank, props.minRank))
      ? { onJoin: control.join, label: '入る', pending: control.pending }
      : null;

  return (
    <div>
      <div className={`flex min-h-10 items-center justify-between gap-3 ${props.stamp ? 'mb-6' : 'mb-3'}`}>
        <h2 className="section-title">パーティ</h2>
        {props.stamp ? (
          <p
            className="lineup-stamp font-black bg-ink px-3 text-[20px] leading-9 whitespace-nowrap text-white"
            
            role="status"
          >
            {props.stamp}
          </p>
        ) : (
          <p className="flex items-baseline gap-2.5" aria-live="polite" aria-label={`${props.capacity}人中${props.occupied}人${props.left > 0 ? `、あと${props.left}人` : '、満員'}`}>
            <span className="type-time text-[30px] leading-none text-ink">
              {props.occupied}
              <span className="text-[20px] text-slate">/{props.capacity}</span>
            </span>
            <span className={`px-2 text-[15px] leading-7 font-black ${props.left > 0 ? 'bg-signal text-ink' : 'bg-ink text-white'}`}>
              {props.left > 0 ? `あと${props.left}人` : '満員'}
            </span>
          </p>
        )}
      </div>
      <Lineup seats={seats} size="lg" label={props.label} joinSeat={seatJoin} tall />
      {!props.isOwner && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-6 lg:hidden">
          <JoinButton
            recruitmentId={props.recruitmentId}
            joinMode={props.joinMode}
            auth={props.auth}
            canJoin={props.canJoin}
            reason={props.reason}
            isOwner={false}
            joined={props.joined}
            src={props.src}
            size="lg"
            hideWhenJoined
            control={control}
            minRank={props.minRank}
            warnBlocked={props.warnBlocked}
          />
        </div>
      )}
    </div>
  );
}
