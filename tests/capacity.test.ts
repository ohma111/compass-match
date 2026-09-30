import { describe, expect, it } from 'vitest';
import { canApprove, canRequestJoin, effectiveStatus, isFull, remainingSlots, seatLabel } from '@/lib/capacity';
import { nowListView } from '@/lib/now-list';

const now = new Date('2026-09-30T12:00:00Z');
const future = '2026-09-30T14:00:00Z';
const past = '2026-09-30T11:00:00Z';

describe('capacity', () => {
  it('counts the owner as one seat', () => {
    expect(seatLabel(3, 0)).toBe('現在1/3人');
    expect(seatLabel(3, 1)).toBe('現在2/3人');
    expect(seatLabel(3, 2)).toBe('現在3/3人');
    expect(remainingSlots(3, 1)).toBe(1);
    expect(isFull(3, 2)).toBe(true);
    expect(isFull(3, 1)).toBe(false);
    expect(remainingSlots(2, 5)).toBe(0);
  });
  it('effective status turns to ended after end time', () => {
    expect(effectiveStatus('open', past, now)).toBe('ended');
    expect(effectiveStatus('full', past, now)).toBe('ended');
    expect(effectiveStatus('open', future, now)).toBe('open');
    expect(effectiveStatus('cancelled', future, now)).toBe('cancelled');
  });
  it('join eligibility', () => {
    const base = { status: 'open' as const, endsAt: future, capacity: 3, approvedCount: 1, isOwner: false, myState: 'none' as const, now };
    expect(canRequestJoin(base).ok).toBe(true);
    expect(canRequestJoin({ ...base, isOwner: true }).ok).toBe(false);
    expect(canRequestJoin({ ...base, approvedCount: 2 }).reason).toBe('満員です');
    expect(canRequestJoin({ ...base, status: 'full' }).ok).toBe(false);
    expect(canRequestJoin({ ...base, endsAt: past }).reason).toBe('この募集は終了しました');
    expect(canRequestJoin({ ...base, status: 'cancelled' }).ok).toBe(false);
    expect(canRequestJoin({ ...base, myState: 'pending' }).reason).toBe('承認待ちです');
    expect(canRequestJoin({ ...base, myState: 'rejected' }).ok).toBe(false);
    expect(canRequestJoin({ ...base, myState: 'cancelled' }).ok).toBe(true);
  });
  it('approval eligibility', () => {
    expect(canApprove(3, 1, 'open', future, now)).toBe(true);
    expect(canApprove(3, 2, 'open', future, now)).toBe(false);
    expect(canApprove(3, 0, 'open', past, now)).toBe(false);
    expect(canApprove(3, 0, 'cancelled', future, now)).toBe(false);
  });
});

describe('now list (feature flag)', () => {
  it('hides the count below threshold', () => {
    expect(nowListView(0, 30)).toEqual({ showCount: false, countLabel: null });
    expect(nowListView(29, 30).showCount).toBe(false);
  });
  it('shows the count at or above threshold', () => {
    expect(nowListView(30, 30)).toEqual({ showCount: true, countLabel: 'いま30人が遊べます' });
  });
});
