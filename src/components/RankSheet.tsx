'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { confirmRankAction } from '@/app/actions';
import type { RankBand } from '@/lib/constants';
import { RankPicker } from './RankPicker';

/**
 * ランクは登録のときには聞かず、初めて募集・参加するときにこのシートで聞く。
 * useEnsureRank() は、ランクが決まっていれば何もせず true、なければシートを開いて決まったら true。
 */
type Ensure = () => Promise<boolean>;
const Ctx = createContext<{ ensure: Ensure; markReady: (rank?: RankBand) => void; rankNow: () => RankBand | null; current: RankBand | null } | null>(null);

export function useEnsureRank(): Ensure {
  return useContext(Ctx)?.ensure ?? (async () => true);
}

/** プロフィールのシートでランクも決めたとき、続けてランクのシートを出さないようにする */
export function useMarkRankReady(): (rank?: RankBand) => void {
  return useContext(Ctx)?.markReady ?? (() => {});
}

/** 今のランク (シートで選んだ直後の値も含む)。関数で返すのは、古い描画の関数からも最新を読めるようにするため */
export function useRankNow(): () => RankBand | null {
  return useContext(Ctx)?.rankNow ?? (() => null);
}

/** 描画用の今のランク (ランク条件を満たさない募集のボタンを最初から押せなくする) */
export function useCurrentRank(): RankBand | null {
  return useContext(Ctx)?.current ?? null;
}

export function RankProvider({ ready, current, children }: { ready: boolean; current: RankBand | null; children: React.ReactNode }) {
  // 決まったかどうかは ref で持つ。プロフィールのシートの直後に呼ばれる ensure は古い描画の関数なので、state だと間に合わない
  const ok = useRef(ready);
  if (ready) ok.current = true;
  const rank = useRef<RankBand | null>(current);
  if (current) rank.current = current;
  const [shown, setShown] = useState<RankBand | null>(current);
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

  const markReady = useCallback((r?: RankBand) => {
    ok.current = true;
    if (r) {
      rank.current = r;
      setShown(r);
    }
  }, []);
  const rankNow = useCallback(() => rank.current, []);
  const value = useMemo(() => ({ ensure, markReady, rankNow, current: shown ?? current }), [ensure, markReady, rankNow, shown, current]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <RankSheet
          current={current}
          onDone={(r) => {
            markReady(r);
            close(true);
          }}
          onCancel={() => close(false)}
        />
      )}
    </Ctx.Provider>
  );
}

function RankSheet({ current, onDone, onCancel }: { current: RankBand | null; onDone: (rank: RankBand) => void; onCancel: () => void }) {
  const router = useRouter();
  const [rank, setRank] = useState<RankBand | ''>(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save() {
    if (!rank) return;
    setError(null);
    start(async () => {
      const r = await confirmRankAction(rank);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone(rank);
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="閉じる" tabIndex={-1} className="sheet-backdrop absolute inset-0 bg-ink/60" onClick={() => !pending && onCancel()} />
      <div role="dialog" aria-modal="true" aria-labelledby="rank-title" className="sheet-panel relative w-full max-w-lg bg-floor pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
          <h2 id="rank-title" className="type-heavy text-[17px]">現在のランクを選んでください</h2>
          <button type="button" onClick={onCancel} disabled={pending} className="-mr-2 flex size-11 items-center justify-center" aria-label="閉じる">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-4 px-4 pt-4 pb-4">
          <RankPicker value={rank} onChange={setRank} />
          {error && <p className="alert-error" role="alert">{error}</p>}
          <button type="button" onClick={save} disabled={pending || !rank} className="btn-primary btn-lg w-full">
            {pending ? '保存しています…' : '決定して続ける'}
          </button>
        </div>
      </div>
    </div>
  );
}
