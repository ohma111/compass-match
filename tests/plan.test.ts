import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPlusActive, shouldShowAds, adSlotId } from '@/lib/plan';

const now = new Date('2026-10-10T00:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe('isPlusActive (DB の private.has_plus と同じ条件)', () => {
  it('行がなければ無効', () => expect(isPlusActive(null, now)).toBe(false));
  it('active / trialing / manual は期限まで有効', () => {
    for (const status of ['active', 'trialing', 'manual'] as const) {
      expect(isPlusActive({ status, current_period_end: days(1) }, now)).toBe(true);
      expect(isPlusActive({ status, current_period_end: days(-1) }, now)).toBe(false);
    }
  });
  it('期限なしは有効', () => expect(isPlusActive({ status: 'manual', current_period_end: null }, now)).toBe(true));
  it('支払い失敗は期間の終わりから3日まで有効', () => {
    expect(isPlusActive({ status: 'past_due', current_period_end: days(-2) }, now)).toBe(true);
    expect(isPlusActive({ status: 'past_due', current_period_end: days(-4) }, now)).toBe(false);
    expect(isPlusActive({ status: 'past_due', current_period_end: null }, now)).toBe(false);
  });
  it('解約済みは期限が残っていても無効 (決済サービスは期間の終わりに canceled にする)', () => {
    expect(isPlusActive({ status: 'canceled', current_period_end: days(10) }, now)).toBe(false);
  });
});

describe('shouldShowAds', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('初期状態 (環境変数なし) では誰にも出さない', () => {
    expect(shouldShowAds(null)).toBe(false);
    expect(shouldShowAds({ plus: false })).toBe(false);
  });
  it('ON でもクライアントIDがなければ出さない', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ADS', 'true');
    expect(shouldShowAds(null)).toBe(false);
  });
  it('ON + クライアントIDで、未ログイン・無料の方に出し、Plus・管理者には出さない', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ADS', 'true');
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'ca-pub-1234567890123456');
    expect(shouldShowAds(null)).toBe(true);
    expect(shouldShowAds({ plus: false })).toBe(true);
    expect(shouldShowAds({ plus: true })).toBe(false);
    expect(shouldShowAds({ plus: false, isAdmin: true })).toBe(false);
  });
  it('形の違うクライアントID・枠IDは使わない', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ADS', 'true');
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'pub-123"><script>');
    expect(shouldShowAds(null)).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_LIST', 'abc');
    expect(adSlotId('list')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_LIST', '1234567890');
    expect(adSlotId('list')).toBe('1234567890');
  });
});
