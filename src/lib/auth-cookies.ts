// v4: ログイン状態の cookie を、サーバーの Set-Cookie で長期間保つ。
//
// @supabase/ssr のブラウザ用クライアントは document.cookie に書く (dist/main/cookies.js)。
// Safari の ITP は、スクリプトが書いた cookie の有効期限を最長7日に縮める。
// 匿名ユーザーはログインし直す手段がない (引き継ぎコードを作っていなければ) ので、
// 7日来なかっただけでプロフィールが消えたように見えてしまう。
// そこで、サーバーを通るたびに同じ値を Set-Cookie (HTTPヘッダー) で書き直し、期限を400日に延ばす。
// HTTP ヘッダーで付いたファーストパーティの cookie は ITP の7日制限の対象外。
import { DEFAULT_COOKIE_OPTIONS } from '@supabase/ssr';

/** Supabase のセッション cookie (大きいときは .0 .1 … に分割される) */
export const AUTH_COOKIE_RE = /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/i;

export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function persistentCookieOptions(secure: boolean) {
  return { ...DEFAULT_COOKIE_OPTIONS, maxAge: AUTH_COOKIE_MAX_AGE, secure };
}

export function isAuthCookie(name: string): boolean {
  return AUTH_COOKIE_RE.test(name);
}
