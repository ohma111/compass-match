'use client';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/app/actions';
import { InlineConfirm } from './InlineConfirm';

/** ログアウト。引き継ぎコードのない匿名アカウントは、戻れなくなることを先に伝える (確認は画面の中で出す) */
export function SignOutButton({ className, warnNoWayBack }: { className: string; warnNoWayBack: boolean }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <form action={signOutAction} className="py-3">
        <InlineConfirm
          message={
            warnNoWayBack
              ? '引き継ぎコードを作成していないため、ログアウトするとこのプロフィールには戻れなくなります。ログアウトしますか？'
              : 'ログアウトしますか？'
          }
          confirmLabel="ログアウト"
          danger
          submit
          onConfirm={() => undefined}
          onCancel={() => setAsking(false)}
        />
      </form>
    );
  }
  return (
    <button type="button" className={`${className} text-signal-deep`} onClick={() => setAsking(true)}>
      <LogOut className="size-5" aria-hidden />
      ログアウト
    </button>
  );
}
