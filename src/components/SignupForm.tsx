'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { signupAction } from '@/app/auth/actions';
import { LOGIN_ID_PATTERN, LOGIN_ID_RULE, PASSWORD_MIN } from '@/lib/account';
import { Lineup } from './Lineup';
import { RecoveryCodePanel } from './RecoveryCodePanel';

/**
 * 登録(1画面): ユーザーID・パスワード・同意だけ →「はじめる」。
 * 表示名はユーザーIDで始まり (マイページで変えられる)、ランク帯は初めての募集・参加のときに1タップで選ぶ。
 * 成功するとその場でログイン状態になり、引き継ぎコードを1回だけ表示してから元の操作へ戻る。
 */
export function SignupForm({
  next,
  configured,
  initialCode,
  initialLoginId = '',
}: {
  next: string;
  configured: boolean;
  /** 開発用プレビューで「登録完了」画面を表示するため */
  initialCode?: string;
  initialLoginId?: string;
}) {
  const [state, formAction, pending] = useActionState(signupAction, null);
  const [loginId, setLoginId] = useState(initialLoginId);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);

  const code = state?.ok ? state.data?.code : initialCode;
  if (code) {
    return (
      <div className="mx-auto max-w-xl">
        <RecoveryCodePanel code={code} next={state?.ok ? (state.data?.next ?? next) : next} loginId={loginId.trim().toLowerCase()} />
      </div>
    );
  }

  const idOk = LOGIN_ID_PATTERN.test(loginId.trim());
  // 足りない必須項目の数 (押せないボタンに理由として出す)
  const missing = [idOk, password.length >= PASSWORD_MIN, agree].filter((ok) => !ok).length;
  const ready = missing === 0 && configured;
  const shownName = idOk ? loginId.trim().toLowerCase() : 'あなた';

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-16">
      <form action={formAction} className="max-w-xl space-y-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="loginId">ユーザーID</label>
          <input
            id="loginId"
            name="loginId"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            pattern="[A-Za-z0-9_]{3,20}"
            maxLength={20}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            className="input font-bold tracking-wide"
            placeholder="taro_01"
            aria-describedby="loginId-hint"
          />
          <p id="loginId-hint" className={`hint ${loginId && !idOk ? 'font-bold text-signal-deep' : ''}`}>
            {LOGIN_ID_RULE}。最初はこれが表示名になります (あとで変えられます)。
          </p>
        </div>
        <div>
          <label className="label" htmlFor="password">パスワード</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              required
              minLength={PASSWORD_MIN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="input pr-14"
              aria-describedby="password-hint"
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
          <p id="password-hint" className="hint">{PASSWORD_MIN}文字以上。ほかのサイトと同じものは使わないでください。</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 border-2 border-line bg-sheet p-3 text-sm has-[:checked]:border-ink">
          <input
            type="checkbox"
            name="agreeTerms"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            required
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)]"
          />
          <span>
            <Link href="/terms" className="link" target="_blank">利用規約</Link>と
            <Link href="/privacy" className="link" target="_blank">プライバシーポリシー</Link>
            に同意します
            <span className="mt-1 block text-xs text-slate">13歳未満の方は利用できません。18歳未満の方は保護者の同意を得てください。</span>
          </span>
        </label>

        {state && !state.ok && <p className="alert-error" role="alert">{state.error}</p>}
        {!configured && <p className="alert-error">サーバーの設定が完了していないため、現在は登録できません。</p>}
        <button className="btn-primary btn-lg w-full text-base" disabled={pending || !ready}>
          {pending ? '登録しています…' : missing > 0 ? `はじめる (あと${missing}項目)` : 'はじめる'}
          {!pending && missing === 0 && <ArrowRight className="size-5" aria-hidden />}
        </button>
        <p className="text-xs leading-relaxed text-slate">ランク帯は、初めて募集・参加するときに1タップで選びます。</p>
      </form>

      {/* 自分の席のプレビュー (PCのみ) */}
      <aside className="hidden lg:sticky lg:top-28 lg:block" aria-label="ほかの人からの見え方">
        <p className="mb-4 text-sm font-bold">募集の画面では、こう見えます</p>
        <Lineup
          seats={[{ kind: 'member', name: shownName, you: true }, { kind: 'empty' }, { kind: 'empty' }]}
          size="lg"
          label="あなたの席と、空いている2つの席"
        />
        <p className="mt-5 text-sm leading-relaxed text-slate">
          登録が終わると、さっき押した「参加する」「募集する」にそのまま戻ります。
        </p>
      </aside>
    </div>
  );
}
