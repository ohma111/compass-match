import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ADSENSE_CLIENT, ADSENSE_PUBLISHER_ID } from '@/lib/ads';

describe('AdSense の設定', () => {
  it('運営者IDの形が正しい', () => {
    expect(ADSENSE_PUBLISHER_ID).toMatch(/^pub-\d{16}$/);
    expect(ADSENSE_CLIENT).toBe(`ca-${ADSENSE_PUBLISHER_ID}`);
  });

  it('public/ads.txt の運営者IDが src/lib/ads.ts と同じ', () => {
    const txt = readFileSync(path.resolve(__dirname, '../public/ads.txt'), 'utf8').trim();
    expect(txt).toBe(`google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0`);
  });
});
