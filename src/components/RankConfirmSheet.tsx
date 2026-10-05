'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmRankAction } from '@/app/actions';
import type { RankBand } from '@/lib/constants';
import { RankPicker } from './RankPicker';

/** ランクの選び方を変えたあと、前からいる人に1回だけ今のランクを選んでもらう */
export function RankConfirmSheet({ current }: { current: RankBand }) {
  const router = useRouter();
  const [rank, setRank] = useState<RankBand | ''>(current);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return null;
  function save() {
    if (!rank) return;
    start(async () => {
      const r = await confirmRankAction(rank);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <div className="sheet-backdrop absolute inset-0 bg-ink/60" aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="rank-title" className="sheet-panel relative w-full max-w-lg bg-floor pb-[env(safe-area-inset-bottom)]">
        <div className="bg-ink px-4 py-3 text-white">
          <h2 id="rank-title" className="type-heavy text-[17px]">今のランク</h2>
        </div>
        <div className="space-y-4 px-4 pt-4 pb-4">
          <p className="text-sm text-ink-2">ランクを1つずつ選べるようにしました。</p>
          <RankPicker value={rank} onChange={setRank} />
          {error && <p className="alert-error" role="alert">{error}</p>}
          <button type="button" onClick={save} disabled={pending || !rank} className="btn-primary btn-lg w-full">
            {pending ? '保存中…' : '決める'}
          </button>
        </div>
      </div>
    </div>
  );
}
