import { describe, expect, it } from 'vitest';
import {
  formatJst,
  formatJstRange,
  formatJstTime,
  jstDayRange,
  parseJstLocalInput,
  relativeStart,
  toJstLocalInput,
} from '@/lib/time';

describe('JST helpers', () => {
  it('formats UTC as JST regardless of process TZ', () => {
    // 2026-09-30 12:00 UTC = 2026-09-30 21:00 JST (水)
    expect(formatJst('2026-09-30T12:00:00Z')).toBe('9/30(水) 21:00');
    expect(formatJstTime('2026-09-30T15:05:00Z')).toBe('00:05');
  });
  it('crosses the date line correctly', () => {
    // 2026-09-30 16:00 UTC = 2026-10-01 01:00 JST (木)
    expect(formatJst('2026-09-30T16:00:00Z')).toBe('10/1(木) 01:00');
  });
  it('formats ranges on same and different days', () => {
    expect(formatJstRange('2026-09-30T12:00:00Z', '2026-09-30T14:00:00Z')).toBe('9/30(水) 21:00〜23:00');
    expect(formatJstRange('2026-09-30T14:00:00Z', '2026-09-30T16:00:00Z')).toBe('9/30(水) 23:00〜10/1(木) 01:00');
  });
  it('parses datetime-local as JST', () => {
    expect(parseJstLocalInput('2026-10-01T21:00')?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(parseJstLocalInput('2026-10-01T03:00')?.toISOString()).toBe('2026-09-30T18:00:00.000Z');
    expect(parseJstLocalInput('2026-02-30T10:00')).toBeNull();
    expect(parseJstLocalInput('2026-10-01 21:00')).toBeNull();
    expect(parseJstLocalInput('2026-10-01T24:00')).toBeNull();
  });
  it('round-trips toJstLocalInput', () => {
    const d = new Date('2026-12-31T15:30:00Z');
    expect(toJstLocalInput(d)).toBe('2027-01-01T00:30');
    expect(parseJstLocalInput(toJstLocalInput(d))?.getTime()).toBe(d.getTime());
  });
  it('computes JST day ranges in UTC', () => {
    // 2026-09-30 20:00 UTC は JST では 10/1 05:00 → 「今日」は 10/1
    const now = new Date('2026-09-30T20:00:00Z');
    const today = jstDayRange(0, now);
    expect(today.start.toISOString()).toBe('2026-09-30T15:00:00.000Z');
    expect(today.end.toISOString()).toBe('2026-10-01T15:00:00.000Z');
    const tomorrow = jstDayRange(1, now);
    expect(tomorrow.start.toISOString()).toBe('2026-10-01T15:00:00.000Z');
  });
  it('relative start labels', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(relativeStart('2026-09-30T12:25:00Z', '2026-09-30T13:00:00Z', now)).toBe('あと25分');
    expect(relativeStart('2026-09-30T15:00:00Z', '2026-09-30T16:00:00Z', now)).toBe('あと3時間');
    expect(relativeStart('2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z', now)).toBe('あと2日');
    expect(relativeStart('2026-09-30T11:00:00Z', '2026-09-30T13:00:00Z', now)).toBe('開催中');
    expect(relativeStart('2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z', now)).toBe('終了');
  });
});
