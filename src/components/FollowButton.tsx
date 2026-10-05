'use client';
import { useState, useTransition } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { setFollowAction } from '@/app/actions';

/** この人が募集を出したら通知を受け取る */
export function FollowButton({ userId, initial, compact = false }: { userId: string; initial: boolean; compact?: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const r = await setFollowAction(userId, next);
      if (!r.ok) {
        setOn(!next);
        setError(r.error);
      }
    });
  }
  const label = on ? '募集の通知を受け取り中' : '募集を通知';
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        aria-label={compact ? label : undefined}
        className={compact ? `flex size-11 items-center justify-center ${on ? 'text-ink' : 'text-slate hover:text-ink'}` : on ? 'btn-ink w-full' : 'btn-outline w-full'}
      >
        {on ? <BellRing className="size-5" aria-hidden /> : <Bell className="size-5" aria-hidden />}
        {!compact && label}
      </button>
      {error && <span className="text-xs font-bold text-signal-deep" role="alert">{error}</span>}
    </span>
  );
}
