import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PROFILE_COLUMNS, PROFILE_SELECT } from '@/lib/profile-columns';

const root = path.resolve(__dirname, '..');

/** マイグレーションの `grant select (...) on public.profiles to authenticated;` から列を取り出す */
function grantedProfileColumns(role: 'authenticated' | 'anon'): string[] {
  const sql = readFileSync(path.join(root, 'supabase/migrations/20260930000003_rls.sql'), 'utf8');
  const re = new RegExp(`grant select \\(([^)]*)\\) on public\\.profiles to ${role};`, 'm');
  const m = sql.match(re);
  if (!m) throw new Error(`grant for ${role} not found`);
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('profiles column list (v2 「また登録させられる」不具合の回帰テスト)', () => {
  it('only uses columns that authenticated is allowed to read', () => {
    const granted = new Set(grantedProfileColumns('authenticated'));
    for (const c of PROFILE_COLUMNS) expect(granted.has(c), c).toBe(true);
  });

  it('never selects the hidden signup_src column', () => {
    expect(PROFILE_COLUMNS).not.toContain('signup_src' as never);
    expect(PROFILE_SELECT).not.toMatch(/\*/);
  });

  it('signup_src really is outside the authenticated grant (so select * would fail)', () => {
    expect(grantedProfileColumns('authenticated')).not.toContain('signup_src');
  });

  it('no source file uses select("*")', () => {
    const offenders = walk(path.join(root, 'src')).filter((f) => /\.select\(\s*['"`]\s*\*\s*['"`]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('anon embeds of profiles stay within the anon grant (id, display_name, rank_band)', () => {
    expect(grantedProfileColumns('anon').sort()).toEqual(['display_name', 'id', 'rank_band']);
  });
});
