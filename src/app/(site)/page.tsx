import { blockedRecruitmentIds, listRecruitments, listRecruitmentsPublic, myJoinStates } from '@/lib/queries';
import { isSupabaseConfigured, features } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { authStateOf, getSessionClaims } from '@/lib/auth';
import { listFilterSchema } from '@/lib/validation/schemas';
import { cookies } from 'next/headers';
import { HomeView } from '@/components/views/HomeView';
import { CoverView } from '@/components/views/CoverView';
import { COVER_SEEN_COOKIE } from '@/lib/cover';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';
import { applyListView, hasExtraFilter } from '@/lib/list-filter';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filter = listFilterSchema.parse(await searchParams);
  const now = new Date();
  let items: Recruitment[] = [];
  let states: Record<string, JoinState> = {};
  let blocked = new Set<string>();
  let loadError = false;
  // 一覧とログイン情報は互いに依存しないので同時に取る
  // ログインしていない方は全員同じ一覧なので、まとめて取ったもの (15秒) を使う
  const claims = isSupabaseConfigured() ? await getSessionClaims().catch(() => null) : null;
  const listing = isSupabaseConfigured()
    ? (claims ? listRecruitments({ purpose: filter.purpose, soon: filter.soon }, now) : listRecruitmentsPublic(filter.purpose, filter.soon)).then(
        (r) => r,
        () => null,
      )
    : Promise.resolve([] as Recruitment[]);
  const [viewer, listed] = await Promise.all([getViewerSafe(), listing]);
  if (listed === null) loadError = true;
  else items = listed;
  // 未登録で、まだ表紙から一覧に入っていない方には表紙を出す (絞り込みのリンクで来た方は一覧へ)
  const auth = authStateOf(viewer);
  const unfiltered = filter.purpose === 'all' && !filter.soon && !hasExtraFilter(filter);
  if ((auth === 'guest' || auth === 'no-profile') && unfiltered && !(await cookies()).has(COVER_SEEN_COOKIE)) {
    return <CoverView items={items} now={now} loadError={loadError} />;
  }
  if (viewer && items.length > 0) {
    try {
      const ids = items.map((r) => r.id);
      [states, blocked] = await Promise.all([myJoinStates(viewer.userId, ids), blockedRecruitmentIds(ids)]);
    } catch {
      loadError = true;
    }
  }
  // 自分の募集・参加中の募集 (読み込んだ一覧の中から。問い合わせは増やさない)
  const myRooms = viewer
    ? items.filter((r) => r.owner_id === viewer.userId || states[r.id] === 'approved' || states[r.id] === 'pending')
    : [];
  const myRank = viewer?.profile?.rank_band ?? null;
  const shown = applyListView(items, filter, myRank);
  return (
    <HomeView
      items={shown}
      total={items.length}
      myRooms={myRooms}
      canEligible={Boolean(myRank)}
      states={states}
      blocked={[...blocked]}
      auth={auth}
      viewerId={viewer?.userId}
      filter={filter}
      now={now}
      loadError={loadError}
      availableNow={features.availableNow}
    />
  );
}
