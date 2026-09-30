import 'server-only';
import { getViewer, type Viewer } from './auth';
import { isSupabaseConfigured } from './env';

/** Supabase未設定でもページ表示が落ちないように viewer を取得 */
export async function getViewerSafe(): Promise<Viewer | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    return await getViewer();
  } catch {
    return null;
  }
}
