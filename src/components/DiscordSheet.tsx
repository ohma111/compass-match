'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { saveDiscordAction } from '@/app/actions';

/**
 * VC ありの募集に参加するとき、Discord のユーザー名がまだなければこのシートで聞く。
 * 参加が決まったメンバーにだけ表示される (プロフィールの連絡先に保存)。
 */
type Ensure = () => Promise<boolean>;
const Ctx = createContext<Ensure | null>(null);

export function useEnsureDiscord(): Ensure {
  return useContext(Ctx) ?? (async () => true);
}

export function DiscordProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const ok = useRef(ready);
  if (ready) ok.current = true;
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ensure = useCallback<Ensure>(() => {
    if (ok.current) return Promise.resolve(true);
    resolver.current?.(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (done: boolean) => {
    if (done) ok.current = true;
    resolver.current?.(done);
    resolver.current = null;
    setOpen(false);
  };
  const value = useMemo(() => ensure, [ensure]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <Sheet onDone={() => close(true)} onCancel={() => close(false)} />}
    </Ctx.Provider>
  );
}

function Sheet({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = /^@?[a-z0-9_.]{2,32}$/i.test(name.trim());
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    start(async () => {
      const r = await saveDiscordAction(name);
      if (!r.ok) return setError(r.error);
      onDone();
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="閉じる" tabIndex={-1} className="sheet-backdrop absolute inset-0 bg-ink/60" onClick={() => !pending && onCancel()} />
      <div role="dialog" aria-modal="true" aria-labelledby="discord-title" className="sheet-panel relative w-full max-w-lg bg-floor pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
          <div>
            <p className="text-[12px] font-bold text-white/70">VC ありの募集です</p>
            <h2 id="discord-title" className="type-heavy text-[17px]">Discord のユーザー名を入力してください</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={pending} className="-mr-2 flex size-11 items-center justify-center" aria-label="閉じる">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={save} className="space-y-3 px-4 pt-4 pb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={33}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="input text-lg font-bold"
            placeholder="例: compass_taro"
            aria-label="Discord のユーザー名"
          />
          <p className="hint">参加が決まったメンバーにだけ表示されます。プロフィールの連絡先にも保存します。</p>
          {error && <p className="alert-error" role="alert">{error}</p>}
          <button className="btn-primary btn-lg w-full" disabled={pending || !valid}>
            {pending ? '保存しています…' : '保存して続ける'}
          </button>
        </form>
      </div>
    </div>
  );
}
