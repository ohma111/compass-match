import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { RECOVERY_ALPHABET, RECOVERY_LENGTH } from './account';

/** 引き継ぎコードを作る (暗号論的乱数。32文字なので1バイトの下位5ビットで偏りなく選べる) */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_LENGTH);
  let out = '';
  for (const b of bytes) out += RECOVERY_ALPHABET[b & 31];
  return out;
}

/**
 * DB に保存するのはハッシュだけ。コードは80ビットの乱数なので SHA-256 で十分
 * (パスワードのような低エントロピーの値ではない)。総当たりはレート制限で防ぐ。
 */
export function hashRecoveryCode(normalized: string): string {
  return createHash('sha256').update(`compass-match:recovery:v1:${normalized}`).digest('hex');
}

/**
 * レート制限のキー。IP アドレスやユーザーIDをそのまま DB に残さないよう、
 * サーバー専用の秘密 (service_role キー) で HMAC してから保存する。
 */
export function rateKey(secret: string, kind: string, value: string): string {
  return createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

/**
 * 接続元 IP。Vercel は x-forwarded-for を自分で付け直す (利用者が送った値で上書きされない) ので先頭を使う。
 * 取れない場合は 'unknown' (= 全員で1つの枠を共有するので、制限が厳しくなる方向に倒れる)。
 */
export function clientIp(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first) return first;
  return h.get('x-real-ip')?.trim() || 'unknown';
}
