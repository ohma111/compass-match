'use client';
import { useState } from 'react';
import { ArrowRight, Smartphone } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { persistSessionAction } from '@/app/actions';
import {
  isValidTransferCode,
  newTransferCode,
  normalizeTransferCode,
  transferCodeGroups,
  transferCredentials,
} from '@/lib/transfer';
import { CopyButton } from './CopyButton';
import { InlineConfirm } from './InlineConfirm';

/** 4つに区切ったコード (区切りの途中で改行しない) */
export function TransferCodeDisplay({ code }: { code: string }) {
  const groups = transferCodeGroups(code);
  return (
    <p
      className="font-mono font-bold grid grid-cols-2 gap-x-5 gap-y-1 text-[28px] leading-tight tracking-[0.06em] sm:grid-cols-4 sm:text-[30px]"
      aria-label={`引き継ぎコード ${code.split('').join(' ')}`}
    >
      {groups.map((g, i) => (
        <span key={i} className="whitespace-nowrap">{g}</span>
      ))}
    </p>
  );
}

/**
 * マイページ「別の端末でも使う」。
 * 匿名のアカウントに、内部用のアドレスとコード (パスワード) を付ける (Supabase Auth の updateUser)。
 * コードはここで1回だけ表示し、このサイトには保存しない。作り直すと前のコードは使えなくなる。
 */
export function TransferIssue({ email, initialCode }: { email: string | null; initialCode?: string }) {
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const linked = Boolean(email);

  // 確認は画面の中で出す (アプリ内ブラウザでは window.confirm が出ずに false が返る)
  async function issue() {
    setAsking(false);
    setPending(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const next = newTransferCode(email);
      const { email: address, password } = transferCredentials(next);
      // 匿名のうちはアドレスとパスワードを一緒に付ける。付けたあとはパスワードだけ変える
      const { error: err } = await supabase.auth.updateUser(linked ? { password } : { email: address, password });
      if (err) {
        setError(
          err.status === 429
            ? '作成回数が上限に達しました。しばらく待ってからお試しください'
            : err.code === 'email_exists'
              ? '作成できませんでした。もう一度お試しください'
              : '作成できませんでした。もう一度お試しください',
        );
        return;
      }
      await persistSessionAction();
      setCode(next);
    } catch {
      setError('作成できませんでした。もう一度お試しください');
    } finally {
      setPending(false);
    }
  }

  if (code) {
    return (
      <div className="space-y-4">
        <div className="bg-ink p-6 text-white">
          <p className="text-sm text-white/85">引き継ぎコード</p>
          <div className="mt-2">
            <TransferCodeDisplay code={code} />
          </div>
          <div className="mt-4">
            <CopyButton text={transferCodeGroups(code).join('-')} onInk />
          </div>
        </div>
        <p className="text-sm font-bold">スクリーンショットなどで保存してください。閉じると二度と表示されません。</p>
        <button type="button" className="btn-outline w-full" onClick={() => setCode(null)}>
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="alert-error" role="alert">{error}</p>}
      {asking ? (
        <InlineConfirm message="引き継ぎコードを作り直しますか？ 今のコードは使えなくなります。" confirmLabel="作り直す" onConfirm={issue} onCancel={() => setAsking(false)} />
      ) : (
        <button type="button" className={linked ? 'btn-outline w-full' : 'btn-primary w-full'} onClick={() => (linked ? setAsking(true) : void issue())} disabled={pending}>
          <Smartphone className="size-5" aria-hidden />
          {pending ? '作成中…' : linked ? 'コードを作り直す' : '引き継ぎコードを作る'}
        </button>
      )}
    </div>
  );
}

/** 「引き継ぐ」: 別の端末で作ったコードを入れて、同じプロフィールで続ける */
export function TransferRedeem({ configured, hasProfileHere }: { configured: boolean; hasProfileHere: boolean }) {
  const [raw, setRaw] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const code = normalizeTransferCode(raw);
  const valid = isValidTransferCode(code);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError('引き継ぎコードは20文字です');
      return;
    }
    // この端末に別のプロフィールがあるときは、切り替えてよいか画面の中で確かめる
    if (hasProfileHere) setAsking(true);
    else void login();
  }

  async function login() {
    setAsking(false);
    setPending(true);
    setError(null);
    try {
      const { email, password } = transferCredentials(code);
      const { error: err } = await getBrowserClient().auth.signInWithPassword({ email, password });
      if (err) {
        setError(
          err.status === 429
            ? '試行回数が上限に達しました。しばらく待ってからお試しください'
            : '引き継ぎコードが正しくありません',
        );
        setPending(false);
        return;
      }
      await persistSessionAction();
      window.location.assign('/me');
    } catch {
      setError('引き継げませんでした。もう一度お試しください');
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label" htmlFor="transfer-code">引き継ぎコード</label>
        <input
          id="transfer-code"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="input font-bold tracking-[0.12em] uppercase"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          aria-describedby="transfer-hint"
        />
        <p id="transfer-hint" className="hint">
          {code.length}/20
        </p>
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {asking ? (
        <InlineConfirm
          message="今のプロフィールから切り替えますか？ 今のプロフィールの引き継ぎコードがないと、今のプロフィールには戻れなくなります。"
          confirmLabel="切り替えてログイン"
          onConfirm={login}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <button className="btn-primary btn-lg w-full text-base" disabled={pending || !configured || code.length === 0}>
          {pending ? '確認中…' : 'ログイン'}
          {!pending && <ArrowRight className="size-5" aria-hidden />}
        </button>
      )}
    </form>
  );
}
