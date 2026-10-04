'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function loadingCount(): number {
  return (window as unknown as { __cmLoading?: number }).__cmLoading ?? 0;
}

/**
 * 画面上端の朱のバー。サイト内リンクを押した瞬間に伸び始め、
 * URL が変わり、かつ骨組み (loading.tsx) が消えたら端まで走って消える。
 * 速い遷移 (120ms 未満) では出さない (ちらつき防止)。
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  const show = useRef<number | null>(null);
  const pending = useRef(false);
  const arrived = useRef(false);

  useEffect(() => {
    function finish() {
      if (!pending.current || !arrived.current || loadingCount() > 0) return;
      pending.current = false;
      if (show.current) window.clearTimeout(show.current);
      setState((s) => (s === 'run' ? 'done' : 'idle'));
      show.current = window.setTimeout(() => setState('idle'), 400);
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      pending.current = true;
      arrived.current = false;
      if (show.current) window.clearTimeout(show.current);
      show.current = window.setTimeout(() => setState('run'), 120);
      // 何かの理由で終わりを検知できなくても、10秒で消す
      window.setTimeout(() => {
        arrived.current = true;
        (window as unknown as { __cmLoading?: number }).__cmLoading = 0;
        finish();
      }, 10_000);
    }
    document.addEventListener('click', onClick, true);
    window.addEventListener('cm:loading', finish);
    (window as unknown as { __cmFinish?: () => void }).__cmFinish = finish;
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('cm:loading', finish);
    };
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    arrived.current = true;
    (window as unknown as { __cmFinish?: () => void }).__cmFinish?.();
  }, [pathname, search]);

  return <div aria-hidden className="nav-progress" data-state={state} />;
}
