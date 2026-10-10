// 有料版 (Plus) の判定と、機能の出し分け。判定の正は DB の private.has_plus (viewer_header の plus)。
// ここの isPlusActive は同じ条件を TS で書いたもの (テストと、管理画面の表示の確認用)。画面の出し分けには viewer.plus を使う。
import { parseBoolFlag } from './env';

export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'manual';

/** 支払いが失敗したあと、期間の終わりから有効のままにする日数 (DB の private.has_plus と同じ) */
export const PAST_DUE_GRACE_DAYS = 3;

export function isPlusActive(e: { status: EntitlementStatus; current_period_end: string | null } | null, now = new Date()): boolean {
  if (!e) return false;
  const end = e.current_period_end ? new Date(e.current_period_end).getTime() : null;
  if (e.status === 'active' || e.status === 'trialing' || e.status === 'manual') return end === null || end > now.getTime();
  if (e.status === 'past_due') return end !== null && end > now.getTime() - PAST_DUE_GRACE_DAYS * 86_400_000;
  return false;
}

export const monetization = {
  /** Plus の表示 (マイページの状態・管理画面の付与)。初期 OFF */
  get plus(): boolean {
    return parseBoolFlag(process.env.NEXT_PUBLIC_FEATURE_PLUS);
  },
  /** 広告枠。初期 OFF。ON でも Plus の方には出さない */
  get ads(): boolean {
    return parseBoolFlag(process.env.NEXT_PUBLIC_FEATURE_ADS);
  },
  /** AdSense のクライアントID (ca-pub-…)。なければ枠は出さない (開発用プレビューを除く) */
  get adsenseClient(): string | null {
    const v = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
    return v && /^ca-pub-\d{10,20}$/.test(v) ? v : null;
  },
};

export type AdPlacement = 'list' | 'profile';

/** 広告の枠ID (AdSense の data-ad-slot)。置き場所ごとに環境変数で渡す */
export function adSlotId(placement: AdPlacement): string | null {
  const v = (placement === 'list' ? process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIST : process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE)?.trim();
  return v && /^\d{6,20}$/.test(v) ? v : null;
}

/** 広告を出すか。未ログインの方にも出す。Plus の方・管理者には出さない */
export function shouldShowAds(viewer: { plus?: boolean; isAdmin?: boolean } | null): boolean {
  if (!monetization.ads || !monetization.adsenseClient) return false;
  return !viewer?.plus && !viewer?.isAdmin;
}
