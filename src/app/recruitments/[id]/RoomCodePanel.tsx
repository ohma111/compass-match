'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Pencil } from 'lucide-react';
import { setRoomCodeAction } from '@/app/actions';
import { LIMITS } from '@/lib/constants';
import { CopyButton } from '@/components/CopyButton';

/** 部屋番号。参加が確定したメンバーには大きく表示+コピー、募集者はその場で入力・変更できる */
export function RoomCodePanel({ recruitmentId, code, isOwner }: { recruitmentId: string; code: string | null; isOwner: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(isOwner && !code);
  const [value, setValue] = useState(code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await setRoomCodeAction(recruitmentId, value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="card space-y-3 border-brand/40 bg-[linear-gradient(135deg,rgb(255_210_63/0.10),transparent_60%)]" aria-labelledby="room-code-title">
      <div className="flex items-center justify-between">
        <h2 id="room-code-title" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-brand">
          <KeyRound className="size-4" aria-hidden />
          部屋番号
        </h2>
        {isOwner && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost btn-sm -mr-2">
            <Pencil className="size-4" aria-hidden />
            変更
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={save} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.trim())}
              maxLength={LIMITS.roomCode}
              inputMode="numeric"
              autoComplete="off"
              autoFocus={Boolean(code)}
              className="input text-2xl font-extrabold tracking-[0.2em] tabular-nums"
              placeholder="12345"
              aria-label="部屋番号"
            />
            <button className="btn-primary shrink-0" disabled={pending}>
              {pending ? '保存中…' : '保存'}
            </button>
          </div>
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <p className="hint">参加が確定した人にだけ表示されます。</p>
        </form>
      ) : code ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 break-all text-4xl font-extrabold tracking-[0.18em] tabular-nums">{code}</p>
          <CopyButton text={code} />
        </div>
      ) : (
        <p className="text-sm text-muted">まだ入力されていません。募集者が入力するとここに表示されます。</p>
      )}
    </section>
  );
}
