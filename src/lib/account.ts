// ユーザーID + パスワードのアカウント (ブラウザ・サーバー共通の純粋な関数)。
//
// Supabase Auth の email/password をそのまま使い、ユーザーIDから内部用のメールアドレスを作る。
// パスワードの保存・ハッシュは Supabase Auth (GoTrue) が行い、このアプリは一切保存しない。
//
// ドメインに example.edu を使う理由 (詳細は IMPLEMENTATION_NOTES.md v3 節):
// - GoTrue の登録時チェック (checkmail.ValidateFormat) は形式だけを見る → 通る
// - GoTrue の拡張チェック (validateclient: .test/.example/.invalid/.local/.localhost と example.com 等を拒否、
//   DNS/MX を確認) の拒否リストに入っておらず、DNS も存在する → 通る
// - MX が "0 ." (Null MX, RFC 7505) かつ SPF "-all" で、どこにもメールは配送されない
//   (example.com と同じく IANA が保持する例示用ドメイン)
// 一度運用を始めたら変更しないこと (既存ユーザーがログインできなくなる)。
export const AUTH_EMAIL_DOMAIN = 'example.edu';

export const LOGIN_ID_MIN = 3;
export const LOGIN_ID_MAX = 20;
export const LOGIN_ID_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const LOGIN_ID_RULE = '半角英数字と _ で3〜20文字';

export const PASSWORD_MIN = 8;
/** Supabase Auth (bcrypt) が扱えるのは72バイトまで */
export const PASSWORD_MAX_BYTES = 72;

/** ユーザーIDは大文字・小文字を区別しない (保存は小文字) */
export function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLoginId(raw: string): boolean {
  return LOGIN_ID_PATTERN.test(raw.trim());
}

/** ユーザーID → Supabase Auth に渡す内部用メールアドレス (メールは送られない) */
export function authEmailFor(loginId: string): string {
  const id = normalizeLoginId(loginId);
  if (!LOGIN_ID_PATTERN.test(id)) throw new Error('invalid login id');
  return `${id}@${AUTH_EMAIL_DOMAIN}`;
}

/** 内部用メールアドレスか (ユーザーIDで登録したアカウントか) */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${AUTH_EMAIL_DOMAIN}`);
}

export function passwordByteLength(pw: string): number {
  return new TextEncoder().encode(pw).length;
}

// ---------------------------------------------------------------------
// 引き継ぎコード: 紛らわしい文字 (0/O, 1/I) を除いた32文字 × 16桁 = 80ビット。
// 表示は 4桁ずつハイフン区切り。入力は空白・ハイフン・大小文字を無視する。
// ---------------------------------------------------------------------
export const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const RECOVERY_LENGTH = 16;

export function normalizeRecoveryCode(raw: string): string {
  // 全角で入力されても受け付ける (NFKC で半角に)
  return raw.normalize('NFKC').replace(/[\s\-‐−ー]/g, '').toUpperCase();
}

export function isValidRecoveryCode(normalized: string): boolean {
  if (normalized.length !== RECOVERY_LENGTH) return false;
  for (const ch of normalized) if (!RECOVERY_ALPHABET.includes(ch)) return false;
  return true;
}

export function formatRecoveryCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}
