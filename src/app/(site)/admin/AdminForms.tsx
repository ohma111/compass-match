'use client';
import { useActionState, useEffect, useState } from 'react';
import { adminAnnounceAction, adminSetMaintenanceAction } from '@/app/actions';
import { FormMessage } from '@/components/FormMessage';
import type { SiteStatus } from '@/lib/site-status-shared';

/** ISO → 日本時間の「YYYY-MM-DDTHH:mm」(datetime-local の値) */
function toJstInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 16);
}

export function MaintenanceForm({ status }: { status: SiteStatus | null }) {
  const [state, action, pending] = useActionState(adminSetMaintenanceAction, null);
  return (
    <form action={action} className="space-y-4">
      <label className="flex min-h-12 cursor-pointer items-center gap-3 border-2 border-ink/25 bg-sheet px-3 has-[:checked]:border-signal has-[:checked]:bg-signal/10">
        <input type="checkbox" name="manualOn" defaultChecked={status?.manual_on ?? false} className="size-5 accent-[var(--color-signal)]" />
        <span className="font-bold">今すぐメンテナンスにする</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">予定 (日本時間。この間は自動でメンテナンスになります)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold">
            開始
            <input type="datetime-local" name="startsAt" defaultValue={toJstInput(status?.starts_at ?? null)} className="input mt-1" />
          </label>
          <label className="text-xs font-bold">
            終了
            <input type="datetime-local" name="endsAt" defaultValue={toJstInput(status?.ends_at ?? null)} className="input mt-1" />
          </label>
        </div>
        <p className="text-xs text-muted">予定を消すときは、両方を空にして保存してください。</p>
      </fieldset>
      <label className="block text-sm font-bold">
        メンテナンス画面に出す文 (任意・200文字まで)
        <textarea name="message" defaultValue={status?.message ?? ''} maxLength={200} rows={3} className="input mt-1" />
      </label>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? '保存しています…' : '保存する'}</button>
    </form>
  );
}

export function AnnounceForm({ suggestion }: { suggestion: string }) {
  const [state, action, pending] = useActionState(adminAnnounceAction, null);
  const [body, setBody] = useState('');
  useEffect(() => {
    if (state?.ok) setBody('');
  }, [state]);
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!window.confirm('全員にこのお知らせを配信しますか？')) e.preventDefault();
      }}
    >
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        maxLength={300}
        rows={4}
        className="input"
        aria-label="お知らせの本文"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {suggestion ? (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setBody(suggestion)}>
            メンテナンスの予定を入れる
          </button>
        ) : (
          <span />
        )}
        <span className="font-mono text-xs text-muted">{body.length}/300</span>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending || !body.trim()}>{pending ? '配信しています…' : '配信する'}</button>
    </form>
  );
}
