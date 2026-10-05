import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BANNED_TERMS, containsBanned, normalizeForFilter } from '../src/lib/moderation/banned';

describe('禁止語', () => {
  it('DB の一覧と同じ', () => {
    const sql = readFileSync(path.join(__dirname, '../supabase/migrations/20261005000010_v6.sql'), 'utf8');
    const start = sql.indexOf('array[', sql.indexOf('function private.banned_terms()'));
    const body = sql.slice(start, sql.indexOf(']', start));
    const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(inSql).toEqual([...BANNED_TERMS]);
  });

  it('一覧はすべて正規化済みの形で書かれている', () => {
    for (const t of BANNED_TERMS) expect(normalizeForFilter(t)).toBe(t);
  });

  it.each(['ライン交換しよ', 'ＬＩＮＥ ｉｄ', '09012345678', 'a.b@example.com', '何歳？', 'しね', 'イ ン ス タ'])('弾く: %s', (s) => {
    expect(containsBanned(s)).toBe(true);
  });

  it.each(['エンジョイでカスタムやろ', '部屋番号12345です', 'オンラインですか', 'ただいま', 'よろしくね', 'タンクやります'])(
    '通す: %s',
    (s) => {
      expect(containsBanned(s)).toBe(false);
    },
  );
});
