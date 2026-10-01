'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lineup, type Seat } from './Lineup';
import { JoinButton, useJoin, type AuthState } from './JoinButton';
import type { JoinMode } from '@/lib/constants';

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
}) {
  const router = useRouter();
  const control = useJoin(props.recruitmentId, props.auth, props.src);
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

  useEffect(() => {
    if (!props.live) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [props.live, router]);

  const seats = props.seats.map((s, i) => (entering.includes(i) ? { ...s, enter: true } : s));
  const seatJoin =
    !props.isOwner && !props.joined && props.canJoin && props.auth !== 'restricted' && !control.done
      ? { onJoin: control.join, label: props.joinMode === 'instant' ? '参加する' : '申請する', pending: control.pending }
      : null;

  return (
    <div>
      <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
        <h2 className="section-title">パーティ</h2>
        {props.stamp ? (
          <p
            className="lineup-stamp font-display border-4 border-signal bg-sheet px-3 text-[22px] leading-tight whitespace-nowrap text-signal"
            style={{ transform: 'rotate(-6deg)' }}
            role="status"
          >
            {props.stamp}
          </p>
        ) : (
          <p className="text-sm font-bold text-slate" aria-live="polite">
            {props.capacity}人中 {props.occupied}人
            <span className={`type-heavy ml-2 text-base ${props.left > 0 ? 'text-ink' : 'text-slate'}`}>
              {props.left > 0 ? `あと${props.left}人` : '満員'}
            </span>
          </p>
        )}
      </div>
      <Lineup seats={seats} size="lg" label={props.label} joinSeat={seatJoin} />
      {!props.isOwner && (
        <div className="mt-6">
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
          />
        </div>
      )}
    </div>
  );
}
