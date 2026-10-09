import { headers } from 'next/headers';
import { isSupabaseConfigured } from '@/lib/env';
import { getViewerHeader, isRestricted, type Viewer } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { getSiteStatus } from '@/lib/site-status';
import { BanScreen, MaintenancePlanned, MaintenanceScreen } from '@/components/GateScreens';

/** メンテナンス中でも開けるページ (管理者が Discord でログインするための引き継ぎ画面と、規約) */
const OPEN_DURING_MAINTENANCE = ['/transfer', '/auth', '/terms', '/privacy'];
/** BAN 中でも開けるページ */
const OPEN_WHEN_BANNED = ['/terms', '/privacy'];
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // ヘッダーの表示用。取得に失敗してもページ本体 (各ページが自分で取得してエラーを出す) は表示する
  // プロフィール・未読数・Discord の有無は1回の問い合わせで取る (getViewerHeader、ページ側とも共有)
  const [header, status, h] = await Promise.all([
    isSupabaseConfigured() ? getViewerHeader().catch(() => null) : Promise.resolve(null),
    getSiteStatus(),
    headers(),
  ]);
  const viewer: Viewer | null = header?.viewer ?? null;
  const unread = header?.unread ?? 0;
  const discordReady = header?.hasDiscord ?? false;
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
