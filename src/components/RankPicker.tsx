'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RANK_GROUPS, RANK_LABELS, rankGroupOf, type RankBand, type RankGroup } from '@/lib/constants';

/**
 * ランクを選ぶ: まず「S1以上 / A以下」を押し、その中の細かいランクをドロップダウンで選ぶ。
 * min を付けると募集の条件用 (「指定なし」が選べ、表示は S5↑)。
 * name を渡すとフォームに hidden input で送る。
 */
export function RankPicker({
  value,
  onChange,
  name,
  min = false,
  id,
}: {
  value: RankBand | '';
  onChange?: (v: RankBand | '') => void;
  name?: string;
  /** 募集のランク条件 (指定なしあり) */
  min?: boolean;
  id?: string;
}) {
  const [inner, setInner] = useState<RankBand | ''>(value);
  const v = onChange ? value : inner;
  const set = (next: RankBand | '') => (onChange ? onChange(next) : setInner(next));
  const group: RankGroup | 'none' = v ? rankGroupOf(v) : 'none';
  const seg = (on: boolean) =>
    `inline-flex min-h-12 items-center justify-center border-2 px-2 text-sm font-bold transition-colors ${
      on ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-sheet text-ink-2 hover:border-ink'
    }`;

  function pickGroup(g: RankGroup) {
    if (group === g) return;
    // 組を変えたら、その組の真ん中あたりを仮に選ぶ (S1以上なら S5、A以下なら A)
    set(g === 'high' ? 's5' : 'a');
  }

  return (
    <div className="space-y-2">
      {name && <input type="hidden" name={name} value={v} />}
      <div className={`grid gap-2 ${min ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={min ? 'ランク条件' : 'ランク'}>
        {min && (
          <button type="button" role="radio" aria-checked={group === 'none'} className={seg(group === 'none')} onClick={() => set('')}>
            指定なし
          </button>
        )}
        {(['high', 'low'] as const).map((g) => (
          <button key={g} type="button" role="radio" aria-checked={group === g} className={seg(group === g)} onClick={() => pickGroup(g)}>
            {RANK_GROUPS[g].label}
          </button>
        ))}
      </div>
      {group !== 'none' && (
        <label className="relative block">
          <span className="sr-only">{min ? 'どのランクから' : 'ランク'}</span>
          <select
            id={id}
            value={v}
            onChange={(e) => set(e.target.value as RankBand)}
            className="input appearance-none pr-10 text-lg font-black"
          >
            {RANK_GROUPS[group].ranks.map((r) => (
              <option key={r} value={r}>
                {min ? `${RANK_LABELS[r]}以上` : RANK_LABELS[r]}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2" aria-hidden />
        </label>
      )}
    </div>
  );
}
