'use client';
import { useActionState, useState } from 'react';
import { reportAction } from '@/app/actions';
import { FormMessage } from './FormMessage';
import { LIMITS } from '@/lib/constants';
import { keepForm } from '@/lib/use-keep-form';

const TARGET_LABEL = { user: 'このユーザー', recruitment: 'この募集', message: 'このメッセージ' } as const;

export function ReportButton({
  targetType,
  targetId,
  small = true,
  initiallyOpen = false,
}: {
  targetType: 'user' | 'recruitment' | 'message';
  targetId: string;
  small?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [state, formAction, pending] = useActionState(reportAction, null);
  if (!open) {
    return (
      <button type="button" className={small ? 'text-xs text-muted underline' : 'btn-outline btn-sm'} onClick={() => setOpen(true)}>
        通報
      </button>
    );
  }
  return (
    <div className="card mt-2 w-full space-y-2 border-danger/40">
      {state?.ok ? (
        <FormMessage state={state} />
      ) : (
        <form onSubmit={keepForm(formAction)} className="space-y-2">
          <p className="text-sm font-bold">{TARGET_LABEL[targetType]}を通報</p>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <textarea
            name="reason"
            required
            maxLength={LIMITS.reportReason}
            rows={3}
            className="input"
            placeholder="理由を具体的に書いてください (必須)"
          />
          <p className="hint">通報したことは相手に伝わりません。虚偽の通報は利用停止の対象になります。</p>
          <FormMessage state={state} />
          <div className="flex gap-2">
            <button className="btn-danger btn-sm" disabled={pending}>{pending ? '送信中…' : '通報する'}</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setOpen(false)}>やめる</button>
          </div>
        </form>
      )}
    </div>
  );
}
