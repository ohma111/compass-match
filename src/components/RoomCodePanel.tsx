'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { setRoomCodeAction } from '@/app/actions';
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
    <section className="bg-ink p-6 text-white" aria-labelledby="room-code-title">
      <div className="flex items-center justify-between">
        <h2 id="room-code-title" className="text-sm font-bold text-white/80">部屋番号</h2>
        {isOwner && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="-mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-white underline-offset-4 hover:underline">
            <Pencil className="size-4" aria-hidden />
            変更
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              pattern="[0-9]{4}"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={Boolean(code)}
              className="font-mono font-bold min-h-14 w-full min-w-0 border-2 border-white/40 bg-ink-2 px-3 text-[28px] tracking-[0.08em] text-white outline-none placeholder:text-white/35 focus:border-white"
              placeholder="1234"
              aria-label="部屋番号 (4桁)"
            />
            <button
              className="inline-flex min-h-14 shrink-0 items-center bg-signal px-5 font-bold text-ink disabled:opacity-50"
              disabled={pending}
            >
              {pending ? '保存中…' : '保存'}
            </button>
          </div>
          {error && <p className="text-[13px] font-bold text-signal-on-ink" role="alert">{error}</p>}
        </form>
      ) : code ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono font-bold min-w-0 break-all text-[44px] leading-tight tracking-[0.08em] tabular-nums lg:text-[52px]">{code}</p>
          <CopyButton text={code} onInk />
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/85">まだ入力されていません</p>
      )}
    </section>
  );
}
