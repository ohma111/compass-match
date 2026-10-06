import { headers } from 'next/headers';
import { getViewerSafe } from '@/lib/viewer-safe';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getSessionClaims, isRestricted, type Viewer } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { getSiteStatus } from '@/lib/site-status';
import { BanScreen, MaintenancePlanned, MaintenanceScreen } from '@/components/GateScreens';

/** メンテナンス中でも開けるページ (管理者が Discord でログインするための引き継ぎ画面と、規約) */
const OPEN_DURING_MAINTENANCE = ['/transfer', '/auth', '/terms', '/privacy'];
/** BAN 中でも開けるページ */
const OPEN_WHEN_BANNED = ['/terms', '/privacy'];
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

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

async function hasDiscord(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('profile_contacts').select('contact_discord').eq('user_id', userId).maybeSingle();
    return Boolean((data as { contact_discord: string | null } | null)?.contact_discord);
  } catch {
    return false;
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // ヘッダーの表示用。取得に失敗してもページ本体 (各ページが自分で取得してエラーを出す) は表示する
  // 未読数はユーザーIDだけで取れるので、プロフィールの取得と並行して始める
  const claims = isSupabaseConfigured() ? await getSessionClaims().catch(() => null) : null;
  const [viewer, unread, status, discordReady, h] = await Promise.all([
    getViewerSafe().catch((): Viewer | null => null),
    claims ? unreadCount(claims.userId) : Promise.resolve(0),
    getSiteStatus(),
    claims ? hasDiscord(claims.userId) : Promise.resolve(false),
    headers(),
  ]);
  const path = h.get('x-pathname') ?? '';
  const isAdmin = Boolean(viewer?.isAdmin);
  // メンテナンス中は管理者以外にメンテナンスの画面を出す。書き込みは DB 側 (require_active_user) でも止めている
  const maintenance = Boolean(status?.active) && !isAdmin && !under(path, OPEN_DURING_MAINTENANCE);
  const bannedAt = viewer?.profile?.banned_at ?? null;
  const banned = Boolean(bannedAt) && !isAdmin && !under(path, OPEN_WHEN_BANNED);
  let content: React.ReactNode = children;
  if (maintenance && status) content = <MaintenanceScreen status={status} />;
  else if (banned && bannedAt) content = <BanScreen bannedAt={bannedAt} />;
  return (
    <AppShell
      unread={unread}
      signedIn={Boolean(viewer)}
      restricted={!banned && !maintenance && isRestricted(viewer?.profile ?? null)}
      notice={
        status?.active && isAdmin ? (
          <p className="alert-error mb-6">メンテナンス中です。管理者のため表示されています。</p>
        ) : status && !maintenance ? (
          <MaintenancePlanned status={status} />
        ) : null
      }
      configured={isSupabaseConfigured()}
      rankReady={Boolean(viewer?.profile?.rank_band && viewer.profile.rank_confirmed !== false)}
      currentRank={viewer?.profile?.rank_band ?? null}
      discordReady={discordReady}
    >
      {content}
    </AppShell>
  );
}
