import { remainingSlots, seatLabel, slotDots } from '@/lib/capacity';

/** 残り枠を ●●○ で表示 */
export function SlotDots({ capacity, approvedCount }: { capacity: number; approvedCount: number }) {
  const dots = slotDots(capacity, approvedCount);
  const left = remainingSlots(capacity, approvedCount);
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={seatLabel(capacity, approvedCount)}>
      <span className="inline-flex gap-1" aria-hidden>
        {dots.map((filled, i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full ${
              filled ? 'bg-[var(--tone,var(--color-brand))] shadow-[0_0_6px_var(--tone,var(--color-brand))]' : 'border-[1.5px] border-muted/70'
            }`}
          />
        ))}
      </span>
      <span aria-hidden className={`text-xs font-extrabold ${left > 0 ? 'text-fg' : 'text-muted'}`}>
        {left > 0 ? `あと${left}人` : '満員'}
      </span>
    </span>
  );
}
