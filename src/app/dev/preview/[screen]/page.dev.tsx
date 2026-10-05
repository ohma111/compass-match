// 開発用フィクスチャプレビュー。`next dev` のときだけ存在する (next.config の pageExtensions)。
// 本番の Supabase には接続せず、src/lib/fixtures.ts のダミーデータで主要画面を表示する。
// スクリーンショット: npm run preview:shots (scripts/screenshots.mjs)
import { notFound } from 'next/navigation';
import { isPreviewEnabled } from '@/lib/preview';
import { AppShell } from '@/components/AppShell';
import type { TabKey } from '@/components/TabBar';
import { HomeView } from '@/components/views/HomeView';
import { RecruitmentDetailView } from '@/components/views/RecruitmentDetailView';
import { NewRecruitmentView } from '@/components/views/NewRecruitmentView';
import { TransferView } from '@/components/views/AuthViews';
import { MeView } from '@/components/views/MeView';
import { GuestMeView } from '@/components/views/GuestMeView';
import { DetailSkeleton, HomeSkeleton } from '@/components/loading/Skeletons';
import { ME_ID, people, detail, feed, homeStates, meProfile, myRecruitments } from '@/lib/fixtures';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'プレビュー', robots: { index: false } };

export default async function PreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const { screen } = await params;
  const now = new Date();
  let body: React.ReactNode;
  let active: TabKey = 'none';
  let signedIn = true;
  let unread = 2;
  let sheetOpen = false;

  switch (screen) {
    case 'me-guest':
      active = 'me';
      signedIn = false;
      unread = 0;
      body = <GuestMeView />;
      break;
    case 'loading':
      active = 'home';
      body = <HomeSkeleton />;
      break;
    case 'loading-detail':
      body = <DetailSkeleton />;
      break;
    case 'sheet':
      // 初めての人が「参加する」を押した直後 (プロフィールのシート)
      active = 'home';
      signedIn = false;
      unread = 0;
      sheetOpen = true;
      body = (
        <HomeView items={feed(now)} states={{}} auth="guest" viewerId={null} filter={{ purpose: 'all', soon: false }} now={now} />
      );
      break;
    case 'home':
    case 'home-empty':
      active = 'home';
      body = (
        <HomeView
          items={screen === 'home' ? [...feed(now)].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : []}
          states={homeStates()}
          auth="ready"
          viewerId={ME_ID}
          filter={{ purpose: 'all', soon: false }}
          now={now}
        />
      );
      break;
    case 'new':
      active = 'new';
      body = <NewRecruitmentView auth="ready" serverNow={now.toISOString()} src="" ownerName="ゆずぽん" />;
      break;
    case 'detail':
    case 'detail-joined': {
      const joined = screen === 'detail-joined';
      const d = detail(now, joined);
      body = (
        <RecruitmentDetailView
          r={d.r}
          now={now}
          auth="ready"
          viewerId={ME_ID}
          participations={d.participations}
          myState={d.myState}
          roomCode={d.roomCode}
          contacts={d.contacts}
          messages={d.messages}
          src={null}
          justJoined={joined}
          siteUrl="http://localhost:3000"
        />
      );
      break;
    }
    case 'transfer':
      active = 'auth';
      signedIn = false;
      unread = 0;
      body = <TransferView configured hasProfileHere={false} />;
      break;
    case 'login':
      active = 'auth';
      signedIn = false;
      unread = 0;
      body = <TransferView configured hasProfileHere={false} />;
      break;
    case 'me':
    case 'transfer-code':
      active = 'me';
      body = (
        <MeView
          userId={ME_ID}
          profile={meProfile(now)}
          loginId={null}
          accountKind="anonymous"
          transferEmail={null}
          previewTransferCode={screen === 'transfer-code' ? 'K7QMX4RT9WHB2NCE5PLA' : undefined}
          isAdmin={false}
          mates={[people.taro, people.rin, people.kei].map((x, i) => ({ id: x.id, display_name: x.display_name, rank_band: x.rank_band, play_roles: x.play_roles, times: 3 - i, following: i === 0 }))}
          hasContacts={false}
          mine={myRecruitments(now)}
          joined={[{ status: 'approved', recruitment: detail(now, true).r }]}
          now={now}
        />
      );
      break;
    default:
      notFound();
  }

  return (
    <AppShell unread={unread} signedIn={signedIn} restricted={false} configured active={active} sheetOpen={sheetOpen}>
      {body}
    </AppShell>
  );
}
