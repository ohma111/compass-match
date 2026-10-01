import { afterEach, describe, expect, it } from 'vitest';
import { autoEnd, autoTitle, customStartAt, parseHm, resolveStart, startChips, startPreview } from '@/lib/recruit';

const at = (iso: string) => new Date(iso);
const keys = (now: Date) => startChips(now).map((c) => c.key);
const savedTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = savedTz;
});

describe('start chips (JST)', () => {
  it('shows all fixed hours before 21:00 JST', () => {
    const now = at('2026-10-01T11:42:10Z'); // JST 20:42
    const chips = startChips(now);
    expect(chips.map((c) => c.key)).toEqual(['now', 'in30', 'h21', 'h22', 'h23']);
    expect(chips.map((c) => c.label)).toEqual(['今すぐ', '30分後', '21:00', '22:00', '23:00']);
    expect(chips[0].at.toISOString()).toBe('2026-10-01T11:42:00.000Z'); // 分単位に切り捨て
    expect(chips[1].at.toISOString()).toBe('2026-10-01T12:15:00.000Z'); // +30分を5分単位に切り上げ
    expect(chips[2].at.toISOString()).toBe('2026-10-01T12:00:00.000Z'); // 21:00 JST
  });
  it('hides passed fixed hours instead of rolling to tomorrow', () => {
    expect(keys(at('2026-10-01T12:00:00Z'))).toEqual(['now', 'in30', 'h22', 'h23']); // JST 21:00 ちょうど
    expect(keys(at('2026-10-01T12:10:00Z'))).toEqual(['now', 'in30', 'h22', 'h23']); // JST 21:10
    expect(keys(at('2026-10-01T14:30:00Z'))).toEqual(['now', 'in30']); // JST 23:30
  });
  it('treats early morning JST as the new day (UTC is still the previous date)', () => {
    // 2026-09-30 16:00 UTC = JST 10/1 01:00 → 21:00 は 10/1 の 21:00 JST
    const chips = startChips(at('2026-09-30T16:00:00Z'));
    expect(chips.map((c) => c.key)).toEqual(['now', 'in30', 'h21', 'h22', 'h23']);
    expect(chips[2].at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });
  it('does not depend on the process time zone', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(keys(at('2026-10-01T12:10:00Z'))).toEqual(['now', 'in30', 'h22', 'h23']);
    process.env.TZ = 'UTC';
    expect(keys(at('2026-10-01T12:10:00Z'))).toEqual(['now', 'in30', 'h22', 'h23']);
  });
});

describe('resolveStart (server side)', () => {
  const now = at('2026-10-01T12:10:00Z'); // JST 21:10
  it('resolves fixed chips to today JST', () => {
    expect(resolveStart('h22', null, now)?.toISOString()).toBe('2026-10-01T13:00:00.000Z');
    expect(resolveStart('now', null, now)?.toISOString()).toBe('2026-10-01T12:10:00.000Z');
    expect(resolveStart('in30', null, now)?.toISOString()).toBe('2026-10-01T12:40:00.000Z');
  });
  it('accepts a chip that just passed (within 30 min grace), rejects older ones', () => {
    expect(resolveStart('h21', null, now)?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(resolveStart('h21', null, at('2026-10-01T12:31:00Z'))).toBeNull();
  });
  it('custom time: today JST, or tomorrow when already past', () => {
    expect(customStartAt('23:45', now)?.toISOString()).toBe('2026-10-01T14:45:00.000Z');
    expect(customStartAt('01:00', now)?.toISOString()).toBe('2026-10-01T16:00:00.000Z'); // 翌日 01:00 JST
    expect(customStartAt('20:50', now)?.toISOString()).toBe('2026-10-01T11:50:00.000Z'); // 20分前 = 猶予内
    expect(resolveStart('custom', '25:00', now)).toBeNull();
    expect(resolveStart('custom', '', now)).toBeNull();
    expect(parseHm('9:05')).toEqual([9, 5]);
    expect(parseHm('12:60')).toBeNull();
  });
});

describe('auto end / title / preview', () => {
  it('ends one hour after start', () => {
    expect(autoEnd(at('2026-10-01T12:00:00Z')).toISOString()).toBe('2026-10-01T13:00:00.000Z');
  });
  it('builds a title from purpose, rank and remaining slots', () => {
    expect(autoTitle({ purpose: 'rank', minRank: 's4_6', capacity: 2 })).toBe('ランク S4〜の募集');
    expect(autoTitle({ purpose: 'enjoy', minRank: null, capacity: 3 })).toBe('エンジョイの募集');
    expect(autoTitle({ purpose: 'custom', minRank: null, capacity: 6 })).toBe('カスタムの募集');
    expect(autoTitle({ purpose: 'tournament', minRank: 's10p', capacity: 3 })).toBe('大会練習 S10〜の募集');
    // 残り人数はタイトルに入れない (満員になっても食い違わない)
    expect(autoTitle({ purpose: 'rank', minRank: null, capacity: 3 })).not.toMatch(/あと/);
  });
  it('previews today / tomorrow in JST', () => {
    const now = at('2026-10-01T12:10:00Z');
    expect(startPreview(at('2026-10-01T13:00:00Z'), now)).toBe('今日 22:00');
    expect(startPreview(at('2026-10-01T16:00:00Z'), now)).toBe('明日 01:00');
  });
});
