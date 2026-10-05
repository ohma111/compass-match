'use client';
import { useEffect } from 'react';

// PWA: 最小限のService Worker (オフライン時の案内とプッシュ通知。データはキャッシュしない)
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
