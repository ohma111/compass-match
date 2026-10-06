import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PROFILE_COLUMNS, PROFILE_SELECT } from '@/lib/profile-columns';

const root = path.resolve(__dirname, '..');

/** 全マイグレーションの `grant select (...) on public.profiles to <role>;` から列を取り出す */
function grantedProfileColumns(role: 'authenticated' | 'anon'): string[] {
  const dir = path.join(root, 'supabase/migrations');
  const re = new RegExp(`grant select \\(([^)]*)\\) on public\\.profiles to ${role};`, 'g');
  const cols: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(re)) cols.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (cols.length === 0) throw new Error(`grant for ${role} not found`);
  return cols;
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

  // v5: 席にロールのアイコンを出すため play_roles を足した (20261004000009_v5_usage.sql)
  it('anon embeds of profiles stay within the anon grant (id, display_name, rank_band, play_roles)', () => {
    expect(grantedProfileColumns('anon').sort()).toEqual(['avatar', 'display_name', 'id', 'play_roles', 'rank_band']);
  });

  it('the owner embed used by the public list only asks for anon-granted columns', () => {
    const src = readFileSync(path.join(root, 'src/lib/queries.ts'), 'utf8');
    const m = src.match(/owner:profiles![a-z_]+\(([^)]*)\)/);
    const cols = (m?.[1] ?? '').split(',').map((c) => c.trim());
    const granted = grantedProfileColumns('anon');
    expect(cols.filter((c) => !granted.includes(c))).toEqual([]);
  });
});
