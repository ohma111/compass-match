import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  countdownTone,
  formatJst,
  formatJstRange,
  formatJstTime,
  isSameJstDay,
  jstAt,
  jstDayRange,
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
  it('jstAt builds JST wall-clock times in UTC', () => {
    // 2026-09-30 20:00 UTC = JST 10/1 05:00 → 「今日」21:00 JST = 10/1 12:00 UTC
    const now = new Date('2026-09-30T20:00:00Z');
    expect(jstAt(21, 0, 0, now).toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(jstAt(1, 30, 1, now).toISOString()).toBe('2026-10-01T16:30:00.000Z');
    expect(isSameJstDay('2026-09-30T15:00:00Z', '2026-10-01T14:59:00Z')).toBe(true);
    expect(isSameJstDay('2026-09-30T14:59:00Z', '2026-09-30T15:00:00Z')).toBe(false);
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
  it('countdown labels', () => {
    const now = new Date('2026-09-30T12:00:00Z'); // JST 21:00
    expect(countdownLabel('2026-09-30T12:12:00Z', '2026-09-30T13:12:00Z', now)).toBe('あと12分');
    expect(countdownLabel('2026-09-30T12:00:30Z', '2026-09-30T13:00:00Z', now)).toBe('あと1分');
    expect(countdownLabel('2026-09-30T13:00:00Z', '2026-09-30T14:00:00Z', now)).toBe('あと60分');
    expect(countdownLabel('2026-09-30T13:00:00Z', '2026-09-30T14:00:00Z', new Date('2026-09-30T11:30:00Z'))).toBe('22:00〜');
    expect(countdownLabel('2026-09-30T11:00:00Z', '2026-09-30T13:00:00Z', now)).toBe('開催中');
    expect(countdownLabel('2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z', now)).toBe('終了');
    // 日付をまたぐ: JST 10/1 01:00 は「明日」
    expect(countdownLabel('2026-09-30T16:00:00Z', '2026-09-30T17:00:00Z', now)).toBe('明日 01:00〜');
    expect(countdownLabel('2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z', now)).toBe('10/2 21:00〜');
  });
  it('countdown tone', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(countdownTone('2026-09-30T11:30:00Z', '2026-09-30T12:30:00Z', now)).toBe('live');
    expect(countdownTone('2026-09-30T12:30:00Z', '2026-09-30T13:30:00Z', now)).toBe('soon');
    expect(countdownTone('2026-09-30T12:31:00Z', '2026-09-30T13:31:00Z', now)).toBe('later');
  });
});
