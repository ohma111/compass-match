'use client';
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { countdownLabel, countdownTone } from '@/lib/time';

/** 開始までのカウントダウン (30秒ごとに更新) */
export function Countdown({
  start,
  end,
  serverNow,
  large = false,
}: {
  start: string;
  end: string;
  /** 初回描画はサーバーと同じ時刻で行い、ハイドレーションの不一致を避ける */
  serverNow: string;
  large?: boolean;
}) {
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const n = now;
  const label = countdownLabel(start, end, n);
  const tone = countdownTone(start, end, n);
  const color = tone === 'live' ? 'text-ok' : tone === 'soon' ? 'text-brand' : 'text-fg';
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-extrabold tabular-nums ${color} ${large ? 'text-lg' : 'text-sm'}`}
    >
      {tone === 'live' ? (
        <span className="live-dot size-2 rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)]" aria-hidden />
      ) : (
        <Clock className={large ? 'size-4.5' : 'size-3.5'} aria-hidden />
      )}
      <span>{label}</span>
    </span>
  );
}
