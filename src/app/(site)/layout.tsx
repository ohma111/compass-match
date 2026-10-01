import { getViewerSafe } from '@/lib/viewer-safe';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { isRestricted, type Viewer } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

async function unreadCount(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // ヘッダーの表示用。取得に失敗してもページ本体 (各ページが自分で取得してエラーを出す) は表示する
  let viewer: Viewer | null = null;
  try {
    viewer = await getViewerSafe();
  } catch {
    viewer = null;
  }
  const unread = viewer ? await unreadCount(viewer.userId) : 0;
  return (
    <AppShell
      unread={unread}
      signedIn={Boolean(viewer?.profile)}
      restricted={isRestricted(viewer?.profile ?? null)}
      configured={isSupabaseConfigured()}
    >
      {children}
    </AppShell>
  );
}
