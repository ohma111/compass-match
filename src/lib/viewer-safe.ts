import 'server-only';
import { getViewer, type Viewer } from './auth';
import { isSupabaseConfigured } from './env';

/**
 * ログインしなくても見られるページ用。Supabase 未設定なら null。
 * 取得エラーは握りつぶさず投げる (エラー画面で再読み込みを促す)。
 * null にすると「未ログイン」扱いになり、登録済みの人が登録画面へ誘導されてしまうため。
 */
export async function getViewerSafe(): Promise<Viewer | null> {
  if (!isSupabaseConfigured()) return null;
  return getViewer();
}
