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
import { LoginView, SignupView } from '@/components/views/AuthViews';
import { MeView } from '@/components/views/MeView';
import { ME_ID, detail, feed, homeStates, meProfile, myRecruitments } from '@/lib/fixtures';

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

  switch (screen) {
    case 'home':
    case 'home-empty':
      active = 'home';
      body = (
        <HomeView
          items={screen === 'home' ? feed(now) : []}
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
    case 'signup':
    case 'signup-done':
      signedIn = false;
      unread = 0;
      body = (
        <SignupView
          next="/recruitments/new"
          configured
          resuming={false}
          initialCode={screen === 'signup-done' ? 'K7QM4XRT9WHB2NCE' : undefined}
          initialLoginId="yuzupon"
        />
      );
      break;
    case 'login':
      signedIn = false;
      unread = 0;
      body = <LoginView next="/" configured resuming={false} />;
      break;
    case 'me':
      active = 'me';
      body = (
        <MeView
          userId={ME_ID}
          profile={meProfile(now)}
          loginId="yuzupon"
          isAdmin={false}
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
    <AppShell unread={unread} signedIn={signedIn} restricted={false} configured active={active}>
      {body}
    </AppShell>
  );
}
