'use client';
import { useActionState } from 'react';
import { feedbackAction } from '@/app/actions';
import { FormMessage } from './FormMessage';
import { LIMITS } from '@/lib/constants';
import { keepForm } from '@/lib/use-keep-form';

export function FeedbackForm({ page, placeholder = '不具合やほしい機能など (個人情報は書かないでください)', submitLabel = '送信する' }: { page?: string; placeholder?: string; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(feedbackAction, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form onSubmit={keepForm(formAction)} className="space-y-3">
      <input type="hidden" name="page" value={page ?? ''} />
      <textarea
        name="body"
        required
        maxLength={LIMITS.feedback}
        rows={6}
        className="input"
        placeholder={placeholder}
      />
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? '送信中…' : submitLabel}</button>
    </form>
  );
}
