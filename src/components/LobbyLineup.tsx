'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lineup, type Seat } from './Lineup';
import { JoinButton, useJoin, type AuthState, type JoinExtra } from './JoinButton';
import { meetsMinRank, type JoinMode, type RankBand } from '@/lib/constants';
import { useCurrentRank } from './RankSheet';
import { getBrowserClient } from '@/lib/supabase/client';

/**
 * 募集の「今の状態」を短い文字列にする。変わっていればページを描き直す。
 * 参加者・募集者は Supabase に直接 (RLS のとおり、申請中の行・部屋番号・発言も)。
 * それ以外の方は人数と状態だけでよいので、CDN に10秒置いた /api/live を読む (何人いても DB は10秒に1回)。
 */
async function liveSignature(recruitmentId: string, member: boolean): Promise<string> {
  if (!member) {
    const res = await fetch(`/api/live/${recruitmentId}`);
    if (!res.ok) throw new Error('busy');
    return JSON.stringify(await res.json());
  }
  const db = getBrowserClient();
  const [rec, parts, room, msg] = await Promise.all([
    db.from('recruitments').select('approved_count, status, hidden_at').eq('id', recruitmentId).maybeSingle(),
    db.from('participations').select('id, status').eq('recruitment_id', recruitmentId).order('id'),
    db.rpc('get_room_code', { p_recruitment_id: recruitmentId }),
    // チャットは Realtime で届くが、つながらない環境のために最新の発言も見る
    db.from('messages').select('id').eq('recruitment_id', recruitmentId).order('created_at', { ascending: false }).limit(1),
  ]);
  if (rec.error) throw rec.error;
  return JSON.stringify([rec.data, parts.error ? null : parts.data, room.error ? null : room.data, msg.error ? null : msg.data]);
}

/** 席の状態を見に行く間隔 (画面が見えているときだけ) */
const LIVE_REFRESH_MS = 20_000;
/** 参加していない方 (未ログインを含む) は人数が変わったかだけ分かればよいので、間を空ける */
const LIVE_REFRESH_GUEST_MS = 45_000;

/**
 * 募集詳細の「ロビー」。
 * - 最初の空き席そのものが参加ボタン (文字の「参加する」ボタンも下に残す)
 * - 開いている間は15秒ごとに変化を確かめ、誰かが入ると、その席が滑り込んで一瞬光る
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
  extra?: JoinExtra;
}) {
  const router = useRouter();
  const myRank = useCurrentRank();
  const control = useJoin(props.recruitmentId, props.auth, props.src, props.minRank, props.vcOn, props.extra);
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

  // 席の自動更新。ページをサーバーで描き直す (Vercel の関数1回) のは、変化があったときだけにする。
  // 間隔ごとには Supabase に小さな問い合わせ (人数・状態・見えている参加の行・部屋番号) だけを送り、
  // 前回と違えば描き直す。参加者・募集者は20秒ごと、それ以外の方は45秒ごと。触らずに置いてあるほど間隔を空ける。
  // 画面が見えていないときは何もせず、戻ってきたら1回だけすぐ確かめる。問い合わせに失敗しても描き直さない。
  const memberRef = useRef(props.joined || props.isOwner);
  memberRef.current = props.joined || props.isOwner;
  useEffect(() => {
    if (!props.live) return;
    let last = Date.now();
    let timer: number;
    let prev: string | null = null;
    let stopped = false;
    let failures = 0;
    const touch = () => {
      last = Date.now();
    };
    const interval = () => {
      const idle = Date.now() - last;
      const first = memberRef.current ? LIVE_REFRESH_MS : LIVE_REFRESH_GUEST_MS;
      const base = idle < 5 * 60_000 ? first : idle < 20 * 60_000 ? Math.max(first, 60_000) : 180_000;
      // 失敗が続くとき (サーバーが混み合っているとき) は間隔を空ける (最大2分)
      return failures > 0 ? Math.max(base, Math.min(180_000, LIVE_REFRESH_MS * 2 ** failures)) : base;
    };
    const check = async () => {
      const sig = await liveSignature(props.recruitmentId, memberRef.current).catch(() => null);
      if (stopped) return;
      // 失敗したときは描き直さない (混み合っているときに、さらに負荷をかけないため)
      if (sig === null) {
        failures++;
        return;
      }
      failures = 0;
      if (prev !== null && sig !== prev) router.refresh();
      prev = sig;
    };
    const tick = async () => {
      if (document.visibilityState === 'visible') await check();
      if (!stopped) timer = window.setTimeout(tick, interval());
    };
    void check();
    timer = window.setTimeout(tick, interval());
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      touch();
      void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [props.live, props.recruitmentId, router]);

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
            <span className={`px-2 text-[18px] leading-8 font-black ${props.left > 0 ? 'bg-signal text-ink' : 'bg-ink text-white'}`}>
              {props.left > 0 ? `@${props.left}人` : '満員'}
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
