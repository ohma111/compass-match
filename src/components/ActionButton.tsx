'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/types';

/** Server Action を呼ぶボタン。結果メッセージを下に表示する */
export function ActionButton({
  action,
  children,
  className = 'btn-primary',
  confirm,
  pendingText = '処理中…',
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setResult(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? pendingText : children}
      </button>
      {result && !result.ok && <p className="text-xs text-danger" role="alert">{result.error}</p>}
      {result && result.ok && result.message && <p className="text-xs text-ok">{result.message}</p>}
    </div>
  );
}
