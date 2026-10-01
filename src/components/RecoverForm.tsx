'use client';
import { useActionState, useState } from 'react';
import { recoverAction } from '@/app/auth/actions';
import { PASSWORD_MIN } from '@/lib/account';
import { RecoveryCodePanel } from './RecoveryCodePanel';

/** パスワードを忘れたとき: ユーザーID + 引き継ぎコード + 新しいパスワード */
export function RecoverForm({ next, configured }: { next: string; configured: boolean }) {
  const [state, formAction, pending] = useActionState(recoverAction, null);
  const [loginId, setLoginId] = useState('');

  if (state?.ok && state.data) {
    return (
      <RecoveryCodePanel
        code={state.data.code}
        next={state.data.next}
        loginId={loginId.trim().toLowerCase()}
        heading="新しいパスワードにしました"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="loginId">ユーザーID</label>
        <input
          id="loginId"
          name="loginId"
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          maxLength={20}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          className="input font-bold tracking-wide"
        />
      </div>
      <div>
        <label className="label" htmlFor="code">引き継ぎコード</label>
        <input
          id="code"
          name="code"
          required
          maxLength={24}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="input font-bold tracking-[0.12em] uppercase"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          aria-describedby="code-hint"
        />
        <p id="code-hint" className="hint">登録したときに表示された16桁のコードです。ハイフンはなくても大丈夫です。</p>
      </div>
      <div>
        <label className="label" htmlFor="password">新しいパスワード</label>
        <input id="password" name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="input" />
        <p className="hint">{PASSWORD_MIN}文字以上。</p>
      </div>
      {state && !state.ok && <p className="alert-error" role="alert">{state.error}</p>}
      <button className="btn-primary btn-lg w-full text-base" disabled={pending || !configured}>
        {pending ? '確認しています…' : '新しいパスワードにする'}
      </button>
      <p className="text-xs leading-relaxed text-slate">
        何度も間違えると、しばらく試せなくなります。引き継ぎコードも分からない場合は、フィードバックから運営者に連絡してください。
      </p>
    </form>
  );
}
