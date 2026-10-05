import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { BANNED_TERMS, containsBanned, containsContact, normalizeForFilter } from '../src/lib/moderation/banned';

/** private.banned_terms() を最後に定義したマイグレーション */
function latestBannedSql(): string {
  const dir = path.join(__dirname, '../supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const sqls = files.map((f) => readFileSync(path.join(dir, f), 'utf8')).filter((s) => s.includes('function private.banned_terms()'));
  return sqls[sqls.length - 1];
}

describe('禁止語', () => {
  it('DB の一覧と同じ', () => {
    const sql = latestBannedSql();
    const start = sql.indexOf('array[', sql.indexOf('function private.banned_terms()'));
    const body = sql.slice(start, sql.indexOf(']', start));
    const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(inSql).toEqual([...BANNED_TERMS]);
  });

  it('一覧はすべて正規化済みの形で書かれている', () => {
    for (const t of BANNED_TERMS) expect(normalizeForFilter(t)).toBe(t);
  });

  it.each(['ライン交換しよ', 'ＬＩＮＥ ｉｄ', '09012345678', 'a.b@example.com', '何歳？', 'しね', 'イ ン ス タ', '〇九〇一二三四五六七八', 'ツイッター見て', 'ゴミ'])('弾く: %s', (s) => {
    expect(containsBanned(s)).toBe(true);
  });

  it.each(['エンジョイでカスタムやろ', '部屋番号1234です', 'オンラインですか', 'ただいま', 'よろしくね', 'タンクやります', 'かえろうか', 'さっき死んでた', 'いちねん'])(
    '通す: %s',
    (s) => {
      expect(containsBanned(s)).toBe(false);
    },
  );

  it.each(['@taro_123', 'abc123', 'ｕｓｅｒ０９１２'])('チャットで弾く (ID): %s', (s) => {
    expect(containsContact(s)).toBe(true);
  });
  it.each(['S5以上で', '3on3やろ', '部屋1234', 'よろしく'])('チャットで通す: %s', (s) => {
    expect(containsContact(s)).toBe(false);
  });
});
