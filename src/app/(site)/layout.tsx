import { getViewerSafe } from '@/lib/viewer-safe';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getSessionClaims, isRestricted, type Viewer } from '@/lib/auth';
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
  // 未読数はユーザーIDだけで取れるので、プロフィールの取得と並行して始める
  const claims = isSupabaseConfigured() ? await getSessionClaims().catch(() => null) : null;
  const [viewer, unread] = await Promise.all([
    getViewerSafe().catch((): Viewer | null => null),
    claims ? unreadCount(claims.userId) : Promise.resolve(0),
  ]);
  return (
    <AppShell
      unread={unread}
      signedIn={Boolean(viewer)}
      restricted={isRestricted(viewer?.profile ?? null)}
      configured={isSupabaseConfigured()}
      confirmRank={viewer?.profile && viewer.profile.rank_confirmed === false ? viewer.profile.rank_band : null}
    >
      {children}
    </AppShell>
  );
}
