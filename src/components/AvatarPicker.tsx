'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Shuffle } from 'lucide-react';
import { setAvatarAction } from '@/app/actions';
import { AVATARS, AVATAR_LABELS, type Avatar } from '@/lib/constants';
import { AvatarIcon } from './Avatar';

/** プロフィールのアイコンを選ぶ。押したらすぐ保存する */
export function AvatarPicker({ initial }: { initial: Avatar | null }) {
  const router = useRouter();
  const [value, setValue] = useState<Avatar | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function pick(next: Avatar | null) {
    if (next === value || pending) return;
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      const r = await setAvatarAction(next);
      if (!r.ok) {
        setValue(prev);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }
  const cell = (on: boolean) =>
    `flex aspect-square min-h-14 flex-col items-center justify-center gap-1 border-2 text-[11px] font-bold transition-colors ${
      on ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-sheet text-ink-2 hover:border-ink'
    }`;
  return (
    <fieldset>
      <legend className="label">アイコン</legend>
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="アイコン">
        <button type="button" role="radio" aria-checked={value === null} className={cell(value === null)} onClick={() => pick(null)}>
          <Shuffle className="size-6" aria-hidden />
          ロール
        </button>
        {AVATARS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value === a} className={cell(value === a)} onClick={() => pick(a)}>
            <AvatarIcon avatar={a} className="size-7" />
            {AVATAR_LABELS[a]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-[13px] font-bold text-signal-deep" role="alert">{error}</p>}
    </fieldset>
  );
}
