'use client';
import Link from '@/components/Link';
import { useActionState, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { onboardAction } from '@/app/actions';
import { FormMessage } from '@/components/FormMessage';
import { RoleIcon } from '@/components/RoleIcon';
import { LIMITS, PLAY_ROLES, PLAY_ROLE_LABELS } from '@/lib/constants';
import { keepForm } from '@/lib/use-keep-form';

export function OnboardingForm({ next, suggestedName }: { next: string; suggestedName: string }) {
  const [state, formAction, pending] = useActionState(onboardAction, null);
  const [name, setName] = useState(suggestedName);
  const [agree, setAgree] = useState(false);
  const ready = name.trim().length > 0 && agree;

  return (
    <form onSubmit={keepForm(formAction)} className="space-y-8">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="displayName">
          ユーザー名 <span className="text-xs font-medium text-slate">(他のユーザーに表示される名前です)</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.displayName}
          autoComplete="nickname"
          className="input text-lg font-bold"
          placeholder="ほかの人に表示される名前"
        />
      </div>

      <fieldset>
        <legend className="label">
          得意ロール <span className="text-xs font-medium text-slate">(任意)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {PLAY_ROLES.map((r) => (
            <label key={r} className="pick">
              <input type="checkbox" name="playRoles" value={r} className="sr-only" />
              <RoleIcon role={r} className="size-4" />
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
