import { describe, expect, it } from 'vitest';
import { isPushEndpoint } from '@/lib/push/endpoint';

describe('isPushEndpoint', () => {
  it('各ブラウザのプッシュサーバーは通す', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QabC')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });
  it('それ以外は通さない', () => {
    expect(isPushEndpoint('https://example.com/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(isPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(1000)}`)).toBe(false);
    expect(isPushEndpoint(null)).toBe(false);
  });
});
