// Google AdSense の設定。運営者ID (ca-pub-…) は秘密ではない (どのサイトでも HTML に出る値)。
// public/ads.txt の pub-… と同じであること (tests/ads.test.ts で確認している)。
// 依存のない純粋な TS に保つこと。

export const ADSENSE_PUBLISHER_ID = 'pub-2634925983268890';

/** 広告タグ・meta タグで使う形 (ca-pub-…) */
export const ADSENSE_CLIENT = `ca-${ADSENSE_PUBLISHER_ID}`;
