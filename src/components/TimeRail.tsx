'use client';
import { useEffect, useState } from 'react';
import { countdownTone, formatJstTime, isSameJstDay, jstDayRange, jstParts } from '@/lib/time';

/**
 * 時間割の左の列: 開始時刻を大きく、その下に「あと8分」「開催中」「明日」。
 * 30秒ごとに数え直す。初回はサーバーの時刻で描いてハイドレーションの不一致を避ける。
 */
export function TimeRail({
  start,
  end,
  serverNow,
  dim = false,
  size = 'md',
}: {
  start: string;
  end: string;
  serverNow: string;
  /** 直前の行と同じ開始時刻なら薄くする (時間割の「同上」) */
  dim?: boolean;
  size?: 'md' | 'xl';
}) {
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), size === 'xl' ? 1_000 : 30_000);
    return () => clearInterval(t);
  }, [size]);

  const tone = countdownTone(start, end, now);
  const ended = now.getTime() >= new Date(end).getTime();
  const msLeft = new Date(start).getTime() - now.getTime();
  const big = tone === 'live' && !ended ? 'NOW' : formatJstTime(start);

  let sub = '';
  if (ended) sub = '終了';
  else if (tone === 'live') sub = '開催中';
  else if (msLeft <= 60 * 60_000) {
    sub =
      size === 'xl'
        ? `あと${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}`
        : `あと${Math.ceil(msLeft / 60_000)}分`;
  } else if (size === 'xl' && !isSameJstDay(start, now)) {
    if (isSameJstDay(start, jstDayRange(1, now).start)) sub = '明日';
    else {
      const p = jstParts(start);
      sub = `${p.month}/${p.day}`;
    }
  }
  const hot = !ended && tone !== 'later';
  const color = ended ? 'text-slate' : hot ? 'text-signal-deep' : dim ? 'text-ink/50' : 'text-ink';

  if (size === 'xl') {
    return (
      <div className="leading-none">
        <p className={`type-poster text-[88px] sm:text-[120px] lg:text-[168px] ${hot ? 'text-signal' : 'text-ink'}`}>{big}</p>
        {sub && (
          <p className="mt-3 font-mono text-[20px] font-bold text-ink tabular-nums lg:text-[24px]" aria-live="off">
            {sub}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="leading-none">
      <p className={`type-time text-[30px] lg:text-[44px] ${color}`}>
        {big}
      </p>
      {sub && <p className={`mt-1.5 text-[11px] font-black whitespace-nowrap tabular-nums lg:text-[13px] ${hot ? 'text-signal-deep' : 'text-slate'}`}>{sub}</p>}
    </div>
  );
}
