'use client';
import { useActionState } from 'react';
import { feedbackAction } from '@/app/actions';
import { FormMessage } from './FormMessage';
import { LIMITS } from '@/lib/constants';

export function FeedbackForm({ page }: { page?: string }) {
  const [state, formAction, pending] = useActionState(feedbackAction, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="page" value={page ?? ''} />
      <textarea
        name="body"
        required
        maxLength={LIMITS.feedback}
        rows={6}
        className="input"
        placeholder="使いにくい所、欲しい機能、不具合など、なんでもどうぞ。(個人情報は書かないでください)"
      />
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? '送信中…' : '送信する'}</button>
    </form>
  );
}
