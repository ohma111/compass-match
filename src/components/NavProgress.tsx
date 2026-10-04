'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * 画面上端のバー。サイト内リンクを押した瞬間に伸び始め、次の画面が出たら閉じる。
 * 速い遷移 (120ms 未満) では出さない (ちらつき防止)。
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  const timer = useRef<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      started.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('run'), 120);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!started.current) return;
    started.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    setState((s) => (s === 'run' ? 'done' : 'idle'));
    timer.current = window.setTimeout(() => setState('idle'), 400);
  }, [pathname, search]);

  return <div aria-hidden className="nav-progress" data-state={state} />;
}
