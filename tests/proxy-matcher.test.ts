import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { SUPABASE_PROJECT_REF, refFromUrl } from '@/lib/supabase-ref';
import { config } from '@/proxy';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

type Entry = string | { source: string; has?: { type: string; key: string }[] };
const entries = config.matcher as Entry[];
const regexOf = (source: string) => new RegExp(`^${source.replace(/^\//, '/')}$`);
const conditional = entries.filter((e): e is Exclude<Entry, string> => typeof e !== 'string');

describe('proxy matcher (Function Invocations を減らすため、必要なときだけ proxy を動かす)', () => {
  it('ログイン Cookie の名前が Supabase の ref と一致している (分割された .0 も)', () => {
    const keys = conditional.flatMap((e) => (e.has ?? []).filter((h) => h.type === 'cookie').map((h) => h.key));
    expect(keys).toContain(`sb-${SUPABASE_PROJECT_REF}-auth-token`);
    expect(keys).toContain(`sb-${SUPABASE_PROJECT_REF}-auth-token.0`);
  });

  it('?src= があるときも動く', () => {
    expect(conditional.some((e) => e.has?.some((h) => h.type === 'query' && h.key === 'src'))).toBe(true);
  });

  it('メンテナンス中にも開くページは未ログインでも動く (画面側がパスで判定する)', () => {
    for (const p of ['/transfer', '/auth/:path*', '/terms', '/privacy']) expect(entries).toContain(p);
  });

  it('条件付きの3つは同じパスを対象にし、静的ファイル・共有画像・/api/live は外す', () => {
    const sources = new Set(conditional.map((e) => e.source));
    expect(sources.size).toBe(1);
    const re = regexOf([...sources][0]);
    for (const p of ['/', '/me', '/recruitments/abc', '/recruitments/new', '/notifications']) expect(re.test(p)).toBe(true);
    for (const p of ['/_next/static/x.js', '/api/live/abc', '/sw.js', '/opengraph-image', '/recruitments/abc/opengraph-image-18nz5w', '/robots.txt'])
      expect(re.test(p)).toBe(false);
  });

  it('refFromUrl は Supabase の Cookie 名と同じ取り出し方をする', () => {
    expect(refFromUrl('https://jjhnmqeukfrknujtkash.supabase.co')).toBe('jjhnmqeukfrknujtkash');
    expect(refFromUrl(undefined)).toBeNull();
  });
});

describe('リンクの先読み', () => {
  it('next/link を直接使わない (先読みのたびに関数が動くため、@/components/Link を使う)', () => {
    const files = walk(path.resolve(__dirname, '../src')).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(path.join('components', 'Link.tsx')));
    const offenders = files.filter((f) => /from ['"]next\/link['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
