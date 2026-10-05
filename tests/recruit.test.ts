import { describe, expect, it } from 'vitest';
import { autoEnd, autoTitle, nextSlot, parseHm, resolveStart, selectableHours, slotAt, startPreview } from '@/lib/recruit';

const at = (iso: string) => new Date(iso);

describe('開始時刻 (15分刻み・今日/明日)', () => {
  const now = at('2026-10-01T12:10:00Z'); // 21:10 JST
  it('今すぐは分単位に切り捨て', () => {
    expect(resolveStart('now', null, null, now)?.toISOString()).toBe('2026-10-01T12:10:00.000Z');
  });
  it('今日の枠・明日の枠', () => {
    expect(resolveStart('slot', 'today', '22:15', now)?.toISOString()).toBe('2026-10-01T13:15:00.000Z');
    expect(resolveStart('slot', 'tomorrow', '01:00', now)?.toISOString()).toBe('2026-10-01T16:00:00.000Z');
  });
  it('15分刻み以外は受け付けない', () => {
    expect(parseHm('22:10')).toBeNull();
    expect(parseHm('25:00')).toBeNull();
    expect(resolveStart('slot', 'today', '', now)).toBeNull();
  });
  it('今日の過ぎた枠は30分の猶予まで', () => {
    expect(slotAt('today', '20:45', now)?.toISOString()).toBe('2026-10-01T11:45:00.000Z');
    expect(slotAt('today', '20:30', now)).toBeNull();
  });
  it('次の枠と、選べる時', () => {
    expect(nextSlot(now)).toEqual({ day: 'today', hm: '21:15' });
    expect(nextSlot(at('2026-10-01T14:50:00Z'))).toEqual({ day: 'tomorrow', hm: '00:00' });
    expect(selectableHours('today', now)).toEqual([21, 22, 23]);
    expect(selectableHours('tomorrow', now)).toHaveLength(24);
  });
  it('JST の早朝は新しい日として扱う', () => {
    expect(selectableHours('today', at('2026-09-30T16:00:00Z'))[0]).toBe(1);
  });
});

describe('auto end / title / preview', () => {
  it('ends one hour after start', () => {
    expect(autoEnd(at('2026-10-01T12:00:00Z')).toISOString()).toBe('2026-10-01T13:00:00.000Z');
  });
  it('builds a title from purpose and rank', () => {
    expect(autoTitle({ purpose: 'rank', minRank: 's5_7' })).toBe('バトルアリーナ S5↑の募集');
    expect(autoTitle({ purpose: 'enjoy', minRank: null })).toBe('フリーバトルの募集');
  });
  it('previews today / tomorrow in JST', () => {
    const now = at('2026-10-01T12:10:00Z');
    expect(startPreview(at('2026-10-01T13:00:00Z'), now)).toBe('今日 22:00');
    expect(startPreview(at('2026-10-01T16:00:00Z'), now)).toBe('明日 01:00');
  });
});
