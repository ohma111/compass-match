'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { setRoomCodeAction } from '@/app/actions';
import { CopyButton } from '@/components/CopyButton';
import { formatJstTime } from '@/lib/time';

/**
 * 部屋番号。参加が確定したメンバーには大きく表示+コピー。
 * 募集者と参加が確定したメンバーは、その場で入力・変更できる (部屋が落ちて作り直したときなど)。
 * 開いている間に番号が変わったら (自動確認で届く)、目立たせて知らせる。
 * スマホでは、この欄が画面の外に出ているあいだ、下に小さく番号を出しておく。
 */
export function RoomCodePanel({
  recruitmentId,
  code,
  isOwner,
  canEdit,
  updatedAt = null,
  updatedByName = null,
  updatedByMe = false,
  floating = false,
}: {
  recruitmentId: string;
  code: string | null;
  isOwner: boolean;
  /** 入力・変更できる (募集者か参加が確定したメンバーで、募集が終わっていない) */
  canEdit: boolean;
  updatedAt?: string | null;
  updatedByName?: string | null;
  updatedByMe?: boolean;
  /** 画面の外に出たら下に小さく出す (スマホ用。1ページに1つだけ) */
  floating?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(isOwner && canEdit && !code);
  const [value, setValue] = useState(code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [changed, setChanged] = useState(false);
  const prev = useRef(code);
  const ref = useRef<HTMLElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  // ほかの方が番号を入れた・変えたとき
  useEffect(() => {
    const before = prev.current;
    prev.current = code;
    if (!code || code === before || updatedByMe) return;
    setValue(code);
    setChanged(true);
    try {
      navigator.vibrate?.(200);
    } catch {}
    const t = window.setTimeout(() => setChanged(false), 15_000);
    return () => window.clearTimeout(t);
  }, [code, updatedByMe]);

  useEffect(() => {
    if (!floating || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(ref.current);
    return () => io.disconnect();
  }, [floating]);

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
    <>
      <section
        ref={ref}
        className={`bg-ink p-6 text-white transition-shadow ${changed ? 'shadow-[0_0_0_4px_var(--color-signal)]' : ''}`}
        aria-labelledby="room-code-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="room-code-title" className="text-sm font-bold text-white/80">部屋番号</h2>
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="-mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-white underline-offset-4 hover:underline">
              <Pencil className="size-4" aria-hidden />
              {code ? '変更' : '入力する'}
            </button>
          )}
        </div>
        {changed && (
          <p className="mt-1 bg-signal px-2 py-1 text-[13px] font-black text-ink" role="alert">
            部屋番号が変わりました
          </p>
        )}
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
            {code && (
              <button type="button" onClick={() => { setEditing(false); setValue(code); setError(null); }} className="min-h-11 text-sm font-bold text-white/80 underline underline-offset-4">
                やめる
              </button>
            )}
            {error && <p className="text-[13px] font-bold text-signal-on-ink" role="alert">{error}</p>}
            <p className="text-[12px] text-white/70">変えると、ほかのメンバーに通知が届きます。</p>
          </form>
        ) : code ? (
          <>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono font-bold min-w-0 break-all text-[44px] leading-tight tracking-[0.08em] tabular-nums lg:text-[52px]">{code}</p>
              <CopyButton text={code} onInk />
            </div>
            {updatedAt && (
              <p className="mt-1 text-[12px] text-white/70">
                {updatedByMe ? 'あなた' : updatedByName ? `${updatedByName}さん` : 'メンバー'}が {formatJstTime(updatedAt)} に入力
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-white/85">
            {isOwner ? 'ゲームで部屋を作ったら、4桁の部屋番号を入力してください。参加が決まったメンバーにだけ表示されます。' : 'まだ入力されていません。部屋を作った方が入力できます。'}
          </p>
        )}
      </section>
      {floating && offscreen && code && !editing && (
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 border-y-2 border-ink bg-ink text-white lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-1.5">
            <p className="flex items-baseline gap-2">
              <span className="text-[12px] font-bold text-white/75">部屋番号</span>
              <span className="font-mono text-[24px] font-bold tracking-[0.08em] tabular-nums">{code}</span>
              {changed && <span className="bg-signal px-1 text-[11px] font-black text-ink">変更</span>}
            </p>
            <CopyButton text={code} onInk small />
          </div>
        </div>
      )}
    </>
  );
}
