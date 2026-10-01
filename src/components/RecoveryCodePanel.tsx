'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatRecoveryCode } from '@/lib/account';
import { CopyButton } from './CopyButton';

/**
 * 引き継ぎコードを1回だけ表示する。保存したことを確認してから先へ進ませる。
 * コードはサーバーにハッシュしか残らないので、ここで控えないと二度と表示できない。
 */
export function RecoveryCodePanel({
  code,
  next,
  loginId,
  heading = '登録できました',
  onContinue,
}: {
  code: string;
  next: string;
  loginId?: string;
  heading?: string;
  onContinue?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const formatted = formatRecoveryCode(code);
  return (
    <section aria-labelledby="recovery-title" className="space-y-5">
      <div>
        <h1 id="recovery-title" className="font-display text-[26px] leading-tight lg:text-[34px]">{heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          下の<strong>引き継ぎコード</strong>を、スクリーンショットかメモで保存してください。
          パスワードを忘れたとき、ユーザーIDとこのコードで新しいパスワードを決められます。
          <strong>この画面を閉じると、もう表示できません。</strong>
        </p>
      </div>
      <div className="bg-ink p-5 text-white">
        {loginId && (
          <p className="text-sm text-white/80">
            ユーザーID <span className="ml-1 font-bold text-white">{loginId}</span>
          </p>
        )}
        <p className="mt-2 text-sm text-white/80">引き継ぎコード</p>
        {/* 4文字ずつのまとまりを崩さない (スマホは2×2、広い画面は1行) */}
        <p
          className="font-display mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-[28px] leading-tight tracking-[0.08em] sm:grid-cols-4 sm:text-[34px]"
          aria-label={`引き継ぎコード ${formatted.split('').join(' ')}`}
        >
          {formatted.split("-").map((g, i) => (
            <span key={i} className="whitespace-nowrap">{g}</span>
          ))}
        </p>
        <div className="mt-4">
          <CopyButton text={formatted} onInk />
        </div>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 border-2 border-ink bg-sheet px-3 text-sm font-bold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-ink)]" />
        引き継ぎコードを保存しました
      </label>
      <button
        type="button"
        className="btn-primary btn-lg w-full"
        disabled={!saved}
        onClick={() => {
          if (onContinue) onContinue();
          else window.location.assign(next);
        }}
      >
        つづける
        <ArrowRight className="size-5" aria-hidden />
      </button>
    </section>
  );
}
