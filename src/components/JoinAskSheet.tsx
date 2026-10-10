'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { DECK_LEVELS } from '@/lib/constants';

/**
 * 参加の途中で聞くこと (下から出すシート)。
 * - デキレ・コラボ数 (バトルアリーナの承認制の募集)。前回の値を入れておく (この端末にだけ保存)
 * - ほかの募集に参加中・募集中のときの確認 (止めはしない)
 */
export interface DeckAnswer {
  deck: number;
  collab: number;
}
interface Ask {
  deck: (cond: { minDeck: number | null; minCollab: number | null }) => Promise<DeckAnswer | null>;
  confirm: (message: string, ok: string) => Promise<boolean>;
}
const Ctx = createContext<Ask | null>(null);

export function useJoinAsk(): Ask {
  return (
    useContext(Ctx) ?? {
      deck: async () => null,
      confirm: async () => true,
    }
  );
}

const LAST_KEY = 'cm_last_deck';

type Open =
  | { kind: 'deck'; minDeck: number | null; minCollab: number | null }
  | { kind: 'confirm'; message: string; ok: string }
  | null;

export function JoinAskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const resolver = useRef<((v: unknown) => void) | null>(null);
  const ask = useCallback(<T,>(o: Exclude<Open, null>) => {
    resolver.current?.(o.kind === 'deck' ? null : false);
    setOpen(o);
    return new Promise<T>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
    });
  }, []);
  const close = (v: unknown) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(null);
  };
  const value = useMemo<Ask>(
    () => ({
      deck: (cond) => ask<DeckAnswer | null>({ kind: 'deck', ...cond }),
      confirm: (message, ok) => ask<boolean>({ kind: 'confirm', message, ok }),
    }),
    [ask],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {open?.kind === 'deck' && <DeckSheet minDeck={open.minDeck} minCollab={open.minCollab} onDone={(a) => close(a)} onCancel={() => close(null)} />}
      {open?.kind === 'confirm' && (
        <Frame title={open.message} onCancel={() => close(false)}>
          <div className="space-y-2 px-4 py-4">
            <button type="button" className="btn-primary btn-lg w-full" onClick={() => close(true)} autoFocus>
              {open.ok}
            </button>
            <button type="button" className="btn-outline w-full" onClick={() => close(false)}>
              やめる
            </button>
          </div>
        </Frame>
      )}
    </Ctx.Provider>
  );
}

function Frame({ title, sub, onCancel, children }: { title: string; sub?: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="閉じる" tabIndex={-1} className="sheet-backdrop absolute inset-0 bg-ink/60" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="join-ask-title" className="sheet-panel relative w-full max-w-lg bg-floor pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
          <div>
            {sub && <p className="text-[12px] font-bold text-white/70">{sub}</p>}
            <h2 id="join-ask-title" className="type-heavy text-[17px]">{title}</h2>
          </div>
          <button type="button" onClick={onCancel} className="-mr-2 flex size-11 shrink-0 items-center justify-center" aria-label="閉じる">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function readLast(): { deck: number | ''; collab: string } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as { deck?: unknown; collab?: unknown } | null;
    return {
      deck: typeof v?.deck === 'number' && DECK_LEVELS.includes(v.deck) ? v.deck : '',
      collab: typeof v?.collab === 'number' ? String(v.collab) : '',
    };
  } catch {
    return { deck: '', collab: '' };
  }
}

function DeckSheet({
  minDeck,
  minCollab,
  onDone,
  onCancel,
}: {
  minDeck: number | null;
  minCollab: number | null;
  onDone: (a: DeckAnswer) => void;
  onCancel: () => void;
}) {
  const [deck, setDeck] = useState<number | ''>(() => readLast().deck);
  const [collab, setCollab] = useState(() => readLast().collab);
  const n = Number(collab);
  const d = deck === '' ? null : deck;
  const valid = d !== null && /^\d{1,4}$/.test(collab) && n >= 0;
  const short = valid && ((minDeck != null && d! < minDeck) || (minCollab != null && n < minCollab));
  const cond = [minDeck != null ? `デキレ${minDeck}以上` : null, minCollab != null ? `コラボ${minCollab}以上` : null].filter(Boolean).join('・');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || short || d === null) return;
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ deck: d, collab: n }));
    } catch {}
    onDone({ deck: d, collab: n });
  }

  return (
    <Frame title="デキレとコラボ数を入力してください" sub={cond ? `この募集の条件: ${cond}` : 'バトルアリーナの承認制の募集です'} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-3 px-4 pt-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">デキレ</span>
            <select value={deck} onChange={(e) => setDeck(e.target.value ? Number(e.target.value) : '')} className="input text-lg font-bold" autoFocus>
              <option value="">選ぶ</option>
              {DECK_LEVELS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">コラボ数</span>
            <input
              value={collab}
              onChange={(e) => setCollab(e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className="input text-lg font-bold"
              placeholder="例: 3"
            />
          </label>
        </div>
        <p className="hint">募集者に表示されます。</p>
        {short && <p className="alert-error" role="alert">この募集の条件 ({cond}) に届いていないため、申し込めません</p>}
        <button className="btn-primary btn-lg w-full" disabled={!valid || Boolean(short)}>
          申し込む
        </button>
      </form>
    </Frame>
  );
}
