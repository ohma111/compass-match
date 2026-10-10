'use client';
import { useEffect } from 'react';

/** AdSense に枠を1回だけ知らせる (画面を移るたびに新しい枠として数える) */
export function AdPush() {
  useEffect(() => {
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // 広告が読み込めなくても画面には影響させない
    }
  }, []);
  return null;
}
