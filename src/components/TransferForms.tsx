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

/** 4つに区切ったコード (区切りの途中で改行しない) */
export function TransferCodeDisplay({ code }: { code: string }) {
  const groups = transferCodeGroups(code);
  return (
    <p
      className="font-display grid grid-cols-2 gap-x-5 gap-y-1 text-[28px] leading-tight tracking-[0.06em] sm:grid-cols-4 sm:text-[30px]"
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
  const linked = Boolean(email);

  async function issue() {
    if (linked && !window.confirm('コードを作り直しますか? 今のコードは使えなくなります。')) return;
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
            ? '短い時間に何度も作ったため、止めています。少し待ってからもう一度押してください'
            : err.code === 'email_exists'
              ? 'たまたま同じコードができました。もう一度押してください'
              : 'コードを作れませんでした。通信を確かめて、もう一度押してください',
        );
        return;
      }
      await persistSessionAction();
      setCode(next);
    } catch {
      setError('コードを作れませんでした。通信を確かめて、もう一度押してください');
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
        <p className="text-sm leading-relaxed text-ink-2">
          新しい端末で「引き継ぐ」を開いて、このコードを入れてください。<strong>この画面を閉じると、もう表示できません。</strong>
          スクショかメモで残しておくと、機種変更でも安心です。
        </p>
        <button type="button" className="btn-outline w-full" onClick={() => setCode(null)}>
          保存したので閉じる
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-2">
        {linked
          ? '引き継ぎコードはもう作ってあります。なくした場合は作り直せます (前のコードは使えなくなります)。'
          : 'このプロフィールは、この端末のブラウザにだけ覚えています。コードを作っておくと、スマホとPCの両方や、機種変更のあとでも同じプロフィールで遊べます。'}
      </p>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button type="button" className="btn-primary w-full" onClick={issue} disabled={pending}>
        <Smartphone className="size-5" aria-hidden />
        {pending ? '作っています…' : linked ? 'コードを作り直す' : '引き継ぎコードを作る'}
      </button>
    </div>
  );
}

/** 「引き継ぐ」: 別の端末で作ったコードを入れて、同じプロフィールで続ける */
export function TransferRedeem({ configured, hasProfileHere }: { configured: boolean; hasProfileHere: boolean }) {
  const [raw, setRaw] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = normalizeTransferCode(raw);
  const valid = isValidTransferCode(code);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError('コードは20文字です。ハイフンや空白はあってもなくても大丈夫です');
      return;
    }
    if (hasProfileHere && !window.confirm('この端末の今のプロフィールから切り替えます。今のプロフィールに引き継ぎコードがないと、あとで戻れません。続けますか?')) return;
    setPending(true);
    setError(null);
    try {
      const { email, password } = transferCredentials(code);
      const { error: err } = await getBrowserClient().auth.signInWithPassword({ email, password });
      if (err) {
        setError(
          err.status === 429
            ? '何度も試されたため、止めています。少し待ってからもう一度入れてください'
            : 'コードが違います。もとの端末のマイページで、コードを確かめてください',
        );
        setPending(false);
        return;
      }
      await persistSessionAction();
      window.location.assign('/me');
    } catch {
      setError('引き継げませんでした。通信を確かめて、もう一度押してください');
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
          もとの端末のマイページ「別の端末でも使う」で作った20文字のコード。{raw && `${code.length}/20`}
        </p>
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button className="btn-primary btn-lg w-full text-base" disabled={pending || !configured || code.length === 0}>
        {pending ? '確かめています…' : '引き継ぐ'}
        {!pending && <ArrowRight className="size-5" aria-hidden />}
      </button>
    </form>
  );
}
