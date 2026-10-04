'use client';
import { useEffect, useState } from 'react';
import { formatJstTime } from '@/lib/time';

/** 時間割の「いま」の線。始まった募集とこれからの募集の境目に引き、時刻は1分ごとに進む */
export function NowLine({ serverNow }: { serverNow: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative flex h-6 items-center" aria-hidden>
      <span className="type-tag relative z-10 bg-signal px-1.5 leading-5 text-ink">いま {formatJstTime(now)}</span>
      <span className="now-line h-[2px] flex-1 bg-signal" />
    </div>
  );
}
