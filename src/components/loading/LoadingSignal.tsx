'use client';
import { useEffect } from 'react';

/**
 * 骨組みが出ている間だけ「読み込み中」を知らせる (画面上端のバーが、URL が変わった後も走り続けるように)。
 * loading.tsx を置いたページでは URL が先に変わるため、URL の変化だけでは終わりを判定できない。
 */
export function LoadingSignal() {
  useEffect(() => {
    const w = window as unknown as { __cmLoading?: number };
    w.__cmLoading = (w.__cmLoading ?? 0) + 1;
    window.dispatchEvent(new Event('cm:loading'));
    return () => {
      w.__cmLoading = Math.max(0, (w.__cmLoading ?? 1) - 1);
      window.dispatchEvent(new Event('cm:loading'));
    };
  }, []);
  return (
    <p role="status" className="sr-only">
      読み込み中
    </p>
  );
}
