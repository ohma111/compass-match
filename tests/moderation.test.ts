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

describe('v3: reporter account age', () => {
  const day = 24 * 60 * 60 * 1000;
  const at = new Date('2026-10-01T12:00:00Z');
  const old = new Date(at.getTime() - 2 * day);
  const fresh = new Date(at.getTime() - 3 * 60 * 60 * 1000);
  it('does not count reports from accounts younger than 24h', () => {
    const reports = [
      { reporterId: 'a', reportedAt: at, reporterCreatedAt: old },
      { reporterId: 'b', reportedAt: at, reporterCreatedAt: old },
      { reporterId: 'c', reportedAt: at, reporterCreatedAt: fresh },
    ];
    expect(distinctReporterCount(reports)).toBe(2);
    expect(shouldAutoHide(reports)).toBe(false);
  });
  it('counts an account exactly 24h old', () => {
    const r = { reporterId: 'a', reportedAt: at, reporterCreatedAt: new Date(at.getTime() - day) };
    expect(distinctReporterCount([r])).toBe(1);
  });
});
