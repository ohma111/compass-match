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
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const label = countdownLabel(start, end, now);
  const tone = countdownTone(start, end, now);
  const color = tone === 'later' ? 'text-ink' : 'text-signal';
  const scale = size === 'xl' ? 'text-[40px] lg:text-[56px]' : size === 'lg' ? 'text-[28px]' : 'text-[22px]';
  return (
    <span className={`font-display inline-flex items-center gap-2 leading-none tabular-nums ${color} ${scale}`}>
      {tone === 'live' && <span className="size-2.5 shrink-0 bg-signal" aria-hidden />}
      <span>{label}</span>
    </span>
  );
}
