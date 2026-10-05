import { describe, expect, it } from 'vitest';
import {
  canApprove,
  canRequestJoin,
  capacityOptions,
  clampCapacity,
  effectiveStatus,
  isFull,
  isValidCapacity,
  joinButtonLabel,
  remainingSlots,
  seatLabel,
  slotDots,
} from '@/lib/capacity';
import { nowListView } from '@/lib/now-list';

const now = new Date('2026-09-30T12:00:00Z');
const future = '2026-09-30T14:00:00Z';
const past = '2026-09-30T11:00:00Z';

describe('capacity', () => {
  it('counts the owner as one seat', () => {
    expect(seatLabel(3, 0)).toBe('3人中1人・あと2人');
    expect(seatLabel(3, 1)).toBe('3人中2人・あと1人');
    expect(seatLabel(3, 2)).toBe('3人中3人・満員');
    expect(remainingSlots(3, 1)).toBe(1);
    expect(isFull(3, 2)).toBe(true);
    expect(isFull(3, 1)).toBe(false);
    expect(remainingSlots(2, 5)).toBe(0);
  });
  it('capacity options per purpose (3v3: party max 3, custom max 6)', () => {
    expect(capacityOptions('rank')).toEqual([2, 3]);
    expect(capacityOptions('enjoy')).toEqual([2, 3]);
    expect(capacityOptions('tournament')).toEqual([2, 3]);
    expect(capacityOptions('custom')).toEqual([2, 3, 4, 5, 6]);
    expect(isValidCapacity('enjoy', 4)).toBe(false);
    expect(isValidCapacity('custom', 6)).toBe(true);
    expect(isValidCapacity('custom', 7)).toBe(false);
    expect(isValidCapacity('rank', 1)).toBe(false);
    expect(isValidCapacity('rank', 2.5)).toBe(false);
  });
  it('clamps capacity when switching purpose', () => {
    expect(clampCapacity('rank', 6)).toBe(3);
    expect(clampCapacity('custom', 3)).toBe(3);
    expect(clampCapacity('enjoy', 1)).toBe(2);
  });
  it('slot dots show owner + joined as filled', () => {
    expect(slotDots(3, 0)).toEqual([true, false, false]);
    expect(slotDots(3, 1)).toEqual([true, true, false]);
    expect(slotDots(3, 5)).toEqual([true, true, true]);
    expect(slotDots(6, 2).filter(Boolean)).toHaveLength(3);
  });
  it('join button label follows join mode', () => {
    expect(joinButtonLabel('instant')).toBe('参加する');
    expect(joinButtonLabel('approval')).toBe('参加を申請する');
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
    expect(canRequestJoin({ ...base, approvedCount: 2 }).reason).toBe('満員');
    expect(canRequestJoin({ ...base, status: 'full' }).ok).toBe(false);
    expect(canRequestJoin({ ...base, endsAt: past }).reason).toBe('終了しました');
    expect(canRequestJoin({ ...base, status: 'cancelled' }).ok).toBe(false);
    expect(canRequestJoin({ ...base, myState: 'pending' }).reason).toBe('承認待ち');
    expect(canRequestJoin({ ...base, myState: 'approved' }).reason).toBe('参加中');
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
    expect(nowListView(30, 30)).toEqual({ showCount: true, countLabel: '今遊べる人 30人' });
  });
});
