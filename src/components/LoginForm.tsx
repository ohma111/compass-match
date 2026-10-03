'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { authEmailFor, isValidLoginId } from '@/lib/account';

/**
 * ユーザーID + パスワードでログイン。
 * ブラウザから直接 Supabase Auth に送る (接続元ごとの回数制限が利用者ごとに正しく効くように)。
 * セッションは cookie に保存され、サーバー側の画面でもログイン状態になる。
 */
export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidLoginId(loginId)) {
      setError('ユーザーIDは半角英数字と _ で3〜20文字です');
      return;
    }
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }
    setPending(true);
    try {
      const { error: err } = await getBrowserClient().auth.signInWithPassword({ email: authEmailFor(loginId), password });
      if (err) {
        setError(
          err.status === 429
            ? '試しすぎです。少し待ってから'
            : err.code === 'invalid_credentials' || err.status === 400
              ? 'ユーザーIDかパスワードが違います'
              : 'ログインできませんでした。もう一度',
        );
        setPending(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setError('ログインできませんでした。もう一度');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
        <label className="label" htmlFor="password">パスワード</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input pr-14"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate hover:text-ink"
            aria-label={show ? 'パスワードを隠す' : 'パスワードを表示する'}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button className="btn-primary btn-lg w-full text-base" disabled={pending || !configured}>
        {pending ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  );
}
