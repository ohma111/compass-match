'use client';
import { useState, useTransition } from 'react';
import { confirmRankAction } from '@/app/actions';
import { DEFAULT_RANK_BAND, RANK_BANDS, RANK_LABELS, type RankBand } from '@/lib/constants';

/**
 * 初めての募集・参加のときだけ出す、ランク帯の1タップ選択。
 * 押したランク帯で保存して、そのまま元の操作 (参加・募集) を続ける。
 */
export function RankPrompt({ verb, onConfirmed }: { verb: string; onConfirmed: () => void }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<RankBand | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(r: RankBand) {
    setPicked(r);
    setError(null);
    start(async () => {
      const res = await confirmRankAction(r);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onConfirmed();
    });
  }

  return (
    <section className="border-2 border-ink bg-sheet p-4" aria-labelledby="rank-prompt-title">
      <h2 id="rank-prompt-title" className="text-[15px] font-black">
        あなたのランク帯は?
      </h2>
      <p className="mt-1 text-[13px] text-slate">タップすると、そのまま{verb}します。あとからマイページで変えられます。</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {RANK_BANDS.map((r) => {
          const suggested = r === DEFAULT_RANK_BAND;
          return (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => choose(r)}
              className={`relative min-h-12 rounded-[3px] border-2 text-sm font-bold disabled:opacity-60 ${
                suggested ? 'border-ink bg-ink text-white' : 'border-line bg-sheet text-ink-2 hover:border-slate'
              }`}
            >
              {pending && picked === r ? '保存中…' : RANK_LABELS[r]}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-[13px] font-bold text-signal-deep" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
