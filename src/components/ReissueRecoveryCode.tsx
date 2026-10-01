'use client';
import { useState, useTransition } from 'react';
import { KeyRound } from 'lucide-react';
import { reissueRecoveryCodeAction } from '@/app/auth/actions';
import { RecoveryCodePanel } from './RecoveryCodePanel';

/** マイページ: 引き継ぎコードを作り直す (なくしたとき用。古いコードは使えなくなる) */
export function ReissueRecoveryCode({ loginId }: { loginId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (code) {
    return (
      <div className="border-2 border-ink bg-sheet p-4">
        <RecoveryCodePanel code={code} next="/me" loginId={loginId} heading="新しい引き継ぎコード" onContinue={() => setCode(null)} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        className="flex min-h-12 w-full items-center gap-3 text-left text-sm font-bold disabled:opacity-50"
        onClick={() => {
          if (!window.confirm('引き継ぎコードを作り直しますか? 今のコードは使えなくなります。')) return;
          setError(null);
          start(async () => {
            const r = await reissueRecoveryCodeAction();
            if (r.ok && r.data) setCode(r.data.code);
            else if (!r.ok) setError(r.error);
          });
        }}
      >
        <KeyRound className="size-5 text-slate" aria-hidden />
        {pending ? '作り直しています…' : '引き継ぎコードを作り直す'}
      </button>
      {error && <p className="text-[13px] font-bold text-signal-deep" role="alert">{error}</p>}
    </div>
  );
}
