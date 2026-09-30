'use client';
import { useState, useTransition } from 'react';
import { setRoomCodeAction } from '@/app/actions';
import { LIMITS } from '@/lib/constants';

export function RoomCodeEditor({ recruitmentId, initial }: { recruitmentId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={LIMITS.roomCode}
          inputMode="numeric"
          className="input text-lg font-bold tracking-widest"
          placeholder="部屋番号"
          aria-label="部屋番号"
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setRoomCodeAction(recruitmentId, value);
              setMsg(r.ok ? { ok: true, text: r.message ?? '更新しました' } : { ok: false, text: r.error });
            })
          }
        >
          保存
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
      <p className="hint">承認済みの参加者にだけ表示されます。</p>
    </div>
  );
}
