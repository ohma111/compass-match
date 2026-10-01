'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { onboardAction } from '@/app/actions';
import { FormMessage } from '@/components/FormMessage';
import { LIMITS, PLAY_ROLES, PLAY_ROLE_LABELS, RANK_BANDS, RANK_LABELS, type RankBand } from '@/lib/constants';

export function OnboardingForm({ next, suggestedName }: { next: string; suggestedName: string }) {
  const [state, formAction, pending] = useActionState(onboardAction, null);
  const [name, setName] = useState(suggestedName);
  const [rank, setRank] = useState<RankBand | ''>('');
  const [agree, setAgree] = useState(false);
  const ready = name.trim().length > 0 && rank !== '' && agree;

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="displayName">表示名</label>
        <input
          id="displayName"
          name="displayName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.displayName}
          autoComplete="nickname"
          className="input text-lg font-bold"
          placeholder="みんなに表示される名前"
        />
        {suggestedName && <p className="hint">Discordの名前を入れています。変えても大丈夫です。</p>}
      </div>

      <fieldset>
        <legend className="label">ランク帯</legend>
        <div className="grid grid-cols-3 gap-2">
          {RANK_BANDS.map((r) => (
            <label key={r} className="pick">
              <input type="radio" name="rankBand" value={r} checked={rank === r} onChange={() => setRank(r)} required className="sr-only" />
              {RANK_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">
          得意ロール <span className="text-xs font-medium text-slate">(任意・いくつでも)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {PLAY_ROLES.map((r) => (
            <label key={r} className="pick">
              <input type="checkbox" name="playRoles" value={r} className="sr-only" />
              {PLAY_ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 border-2 border-line bg-sheet p-3 text-sm has-[:checked]:border-ink">
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
          <span className="mt-1 block text-xs text-muted">13歳未満の方は利用できません。18歳未満の方は保護者の同意を得てください。</span>
        </span>
      </label>

      <FormMessage state={state} />
      <button className="btn-primary btn-lg w-full" disabled={pending || !ready}>
        {pending ? '登録中…' : 'はじめる'}
        {!pending && <ArrowRight className="size-5" aria-hidden />}
      </button>
    </form>
  );
}
