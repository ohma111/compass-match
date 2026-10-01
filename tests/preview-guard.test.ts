import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { isPreviewEnabled, pageExtensionsFor } from '@/lib/preview';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('dev-only fixture preview', () => {
  it('is disabled outside next dev', () => {
    expect(isPreviewEnabled('production')).toBe(false);
    expect(isPreviewEnabled('test')).toBe(false);
    expect(isPreviewEnabled(undefined)).toBe(false);
    expect(isPreviewEnabled('development')).toBe(true);
  });

  it('production builds do not treat *.dev.tsx as routes', () => {
    expect(pageExtensionsFor('production')).not.toContain('dev.tsx');
    expect(pageExtensionsFor(undefined)).not.toContain('dev.tsx');
    expect(pageExtensionsFor('development')).toContain('dev.tsx');
  });

  it('every file under src/app/dev is a .dev.tsx file (so it is excluded from production)', () => {
    const files = walk(path.resolve(__dirname, '../src/app/dev'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.endsWith('.dev.tsx'), f).toBe(true);
  });

  it('no production page imports the fixtures', () => {
    const appFiles = walk(path.resolve(__dirname, '../src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.dev.tsx'));
    const offenders = appFiles.filter((f) => !f.endsWith(path.join('lib', 'fixtures.ts')) && /lib\/fixtures/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
