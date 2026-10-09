'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/types';

/** Server Action を呼ぶボタン。結果メッセージを下に表示する。
 *  確認は画面の中で出す (window.confirm はアプリ内ブラウザで出ずに false が返り、押しても何も起きないことがある) */
export function ActionButton({
  action,
  children,
  className = 'btn-primary',
  confirm,
  pendingText = '処理中…',
  ariaLabel,
  quiet = false,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
  ariaLabel?: string;
  /** 成功したときのメッセージを出さない (一覧の中の小さなボタンなど) */
  quiet?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [asking, setAsking] = useState(false);
  const router = useRouter();
  // 成功の知らせは少しだけ出して消す (エラーは直すまで残す)
  useEffect(() => {
    if (!result?.ok) return;
    const t = window.setTimeout(() => setResult(null), 3000);
    return () => window.clearTimeout(t);
  }, [result]);
  const run = () => {
    setAsking(false);
    start(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) router.refresh();
    });
  };
  const wide = /\bw-full\b/.test(className);
  return (
    <div className={quiet && !asking ? 'flex' : 'space-y-1'}>
      {asking ? (
        <div role="group" aria-label={confirm} className="space-y-2">
          <p className="text-sm">{confirm}</p>
          <div className={wide ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'}>
            <button type="button" className={className} onClick={run} autoFocus>
              {children}
            </button>
            <button type="button" className={`btn-outline${/\bbtn-sm\b/.test(className) ? ' btn-sm' : ''}${wide ? ' w-full' : ''}`} onClick={() => setAsking(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={className}
          disabled={pending}
          aria-label={ariaLabel}
          onClick={() => {
            setResult(null);
            if (confirm) setAsking(true);
            else run();
          }}
        >
          {pending ? pendingText : children}
        </button>
      )}
      {result && !result.ok && <p className="text-xs text-danger" role="alert">{result.error}</p>}
      {!quiet && result && result.ok && result.message && (
        <p className="text-xs text-ok" role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}
