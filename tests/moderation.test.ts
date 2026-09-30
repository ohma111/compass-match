import { describe, expect, it } from 'vitest';
import { distinctReporterCount, shouldAutoHide } from '@/lib/moderation';

describe('report auto-hide', () => {
  it('does not hide with fewer than 3 distinct reporters', () => {
    expect(shouldAutoHide([{ reporterId: 'a' }, { reporterId: 'b' }])).toBe(false);
  });
  it('hides at exactly 3 distinct reporters', () => {
    expect(shouldAutoHide([{ reporterId: 'a' }, { reporterId: 'b' }, { reporterId: 'c' }])).toBe(true);
  });
  it('does not count duplicate reports from the same reporter', () => {
    const reports = [{ reporterId: 'a' }, { reporterId: 'a' }, { reporterId: 'a' }, { reporterId: 'b' }];
    expect(distinctReporterCount(reports)).toBe(2);
    expect(shouldAutoHide(reports)).toBe(false);
  });
  it('ignores resolved reports', () => {
    const reports = [{ reporterId: 'a' }, { reporterId: 'b' }, { reporterId: 'c', resolved: true }];
    expect(shouldAutoHide(reports)).toBe(false);
  });
  it('ignores reports by the target owner', () => {
    const reports = [{ reporterId: 'owner' }, { reporterId: 'b' }, { reporterId: 'c' }];
    expect(shouldAutoHide(reports, 'owner')).toBe(false);
  });
  it('respects a custom threshold and guards bad thresholds', () => {
    const reports = [{ reporterId: 'a' }, { reporterId: 'b' }];
    expect(shouldAutoHide(reports, null, 2)).toBe(true);
    expect(shouldAutoHide(reports, null, 0)).toBe(false);
    expect(shouldAutoHide(reports, null, Number.NaN)).toBe(false);
  });
});
