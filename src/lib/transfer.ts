// v4: 引き継ぎコード (別の端末でも同じプロフィールを使う)。ブラウザ・サーバー共通の純粋な関数。
//
// 匿名ユーザーに、Supabase Auth の updateUser({ email, password }) で
// 内部用メールアドレス (v3 と同じ example.edu。メールは届かない) とパスワードを付ける。
// 「Confirm email」が OFF なら、匿名ユーザーへのメール追加はその場で確定する
// (GoTrue internal/api/user.go: user.IsAnonymous && config.Mailer.Autoconfirm → emailChangeVerify)。
//
// コード 20文字 = 前半8文字 (アドレスの名前部分) + 後半12文字 (パスワード)。
// アドレスは「t.」で始める (v3 のユーザーIDには「.」が使えないので、ユーザーIDのアドレスと重ならない)。
// コードはこのサイトのサーバーにも保存しない (パスワードとして Supabase Auth がハッシュで持つだけ)。
import { AUTH_EMAIL_DOMAIN, RECOVERY_ALPHABET } from './account';

export const TRANSFER_HANDLE_LENGTH = 8;
export const TRANSFER_SECRET_LENGTH = 12;
export const TRANSFER_CODE_LENGTH = TRANSFER_HANDLE_LENGTH + TRANSFER_SECRET_LENGTH;
const PREFIX = 't.';

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  // 32文字なので下位5ビットで偏りなく選べる
  for (const b of bytes) out += RECOVERY_ALPHABET[b & 31];
  return out;
}

/** 新しいコード。すでにアドレスがある (作り直し) ときは、その名前部分を引き継ぐ */
export function newTransferCode(existingEmail?: string | null): string {
  const handle = existingEmail && isTransferEmail(existingEmail) ? handleFromEmail(existingEmail)! : randomChars(TRANSFER_HANDLE_LENGTH);
  return handle + randomChars(TRANSFER_SECRET_LENGTH);
}

export function normalizeTransferCode(raw: string): string {
  return raw.normalize('NFKC').replace(/[\s\-‐−ー]/g, '').toUpperCase();
}

export function isValidTransferCode(normalized: string): boolean {
  if (normalized.length !== TRANSFER_CODE_LENGTH) return false;
  for (const ch of normalized) if (!RECOVERY_ALPHABET.includes(ch)) return false;
  return true;
}

/** 表示用: 5文字ずつ4つに区切る */
export function transferCodeGroups(normalized: string): string[] {
  return normalized.match(/.{1,5}/g) ?? [normalized];
}

/** コード → Supabase Auth のメールアドレスとパスワード */
export function transferCredentials(normalized: string): { email: string; password: string } {
  const handle = normalized.slice(0, TRANSFER_HANDLE_LENGTH).toLowerCase();
  return { email: `${PREFIX}${handle}@${AUTH_EMAIL_DOMAIN}`, password: normalized.slice(TRANSFER_HANDLE_LENGTH) };
}

export function isTransferEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.startsWith(PREFIX) && email.endsWith(`@${AUTH_EMAIL_DOMAIN}`);
}

export function handleFromEmail(email: string): string | null {
  if (!isTransferEmail(email)) return null;
  return email.slice(PREFIX.length, email.indexOf('@')).toUpperCase();
}

/** マイページの出し分け用: どうやってこの端末でログインしているか */
export type AccountKind = 'anonymous' | 'transfer' | 'login-id' | 'oauth';

export function accountKindOf(user: { email?: string | null; is_anonymous?: boolean | null }): AccountKind {
  if (user.is_anonymous) return 'anonymous';
  if (isTransferEmail(user.email)) return 'transfer';
  if (typeof user.email === 'string' && user.email.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) return 'login-id';
  return 'oauth';
}
