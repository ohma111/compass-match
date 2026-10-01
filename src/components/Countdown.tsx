'use client';
import { useEffect, useState } from 'react';
import { countdownLabel, countdownTone } from '@/lib/time';

/** 開始までのカウントダウン (30秒ごとに更新)。まもなく・開催中は朱色 */
export function Countdown({
  start,
  end,
  serverNow,
  size = 'md',
}: {
  start: string;
  end: string;
  /** 初回描画はサーバーと同じ時刻で行い、ハイドレーションの不一致を避ける */
  serverNow: string;
  size?: 'md' | 'lg' | 'xl';
}) {
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  useEffect(() => {
    setNow(new Date());
    // 詳細の大きな表示は1秒ごと (秒まで刻む)。一覧は15秒ごと
    const t = setInterval(() => setNow(new Date()), size === 'xl' ? 1_000 : 15_000);
    return () => clearInterval(t);
  }, [size]);
  const msLeft = new Date(start).getTime() - now.getTime();
  const label =
    size === 'xl' && msLeft > 0 && msLeft <= 60 * 60_000
      ? `あと${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}`
      : countdownLabel(start, end, now);
  const tone = countdownTone(start, end, now);
  const color = tone === 'later' ? 'text-ink' : 'text-signal';
  const scale = size === 'xl' ? 'text-[40px] lg:text-[56px]' : size === 'lg' ? 'text-[28px]' : 'text-[22px]';
  return (
    <span className={`font-display inline-flex items-center gap-2 leading-none tabular-nums ${color} ${scale}`}>
      {tone === 'live' && <span className="size-2.5 shrink-0 bg-signal" aria-hidden />}
      <span aria-live="off">{label}</span>
    </span>
  );
}
