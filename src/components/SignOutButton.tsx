'use client';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/app/actions';

/** ログアウト。引き継ぎコードのない匿名アカウントは、戻れなくなることを先に伝える */
export function SignOutButton({ className, warnNoWayBack }: { className: string; warnNoWayBack: boolean }) {
  return (
    <form
      action={signOutAction}
      onSubmit={(e) => {
        const msg = warnNoWayBack
          ? '引き継ぎコードがないので、ログアウトするとこのプロフィールには戻れません。ログアウトする?'
          : 'ログアウトする?';
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <button className={`${className} text-signal-deep`}>
        <LogOut className="size-5" aria-hidden />
        ログアウト
      </button>
    </form>
  );
}
