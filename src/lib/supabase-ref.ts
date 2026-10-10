/**
 * 本番の Supabase プロジェクトの ref (URL の https://<ref>.supabase.co)。
 * ログイン Cookie の名前 (sb-<ref>-auth-token) に入る。src/proxy.ts の matcher はこの名前で
 * 「ログインしているときだけ proxy を動かす」ので、プロジェクトを変えたらここと proxy.ts を両方直す。
 * 食い違ったままだとセッションが更新されなくなるため、next.config.ts がビルドを止める。
 */
export const SUPABASE_PROJECT_REF = 'jjhnmqeukfrknujtkash';

export function refFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}
