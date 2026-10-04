import { listRecruitments, myJoinStates } from '@/lib/queries';
import { isSupabaseConfigured, features } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { authStateOf } from '@/lib/auth';
import { listFilterSchema } from '@/lib/validation/schemas';
import { HomeView } from '@/components/views/HomeView';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filter = listFilterSchema.parse(await searchParams);
  const now = new Date();
  let items: Recruitment[] = [];
  let states: Record<string, JoinState> = {};
  let loadError = false;
  // 一覧とログイン情報は互いに依存しないので同時に取る
  const listing = isSupabaseConfigured()
    ? listRecruitments({ purpose: filter.purpose, soon: filter.soon }, now).then(
        (r) => r,
        () => null,
      )
    : Promise.resolve([] as Recruitment[]);
  const [viewer, listed] = await Promise.all([getViewerSafe(), listing]);
  if (listed === null) loadError = true;
  else items = listed;
  if (viewer && items.length > 0) {
    try {
      states = await myJoinStates(viewer.userId, items.map((r) => r.id));
    } catch {
      loadError = true;
    }
  }
  return (
    <HomeView
      items={items}
      states={states}
      auth={authStateOf(viewer)}
      viewerId={viewer?.userId}
      filter={{ purpose: filter.purpose, soon: filter.soon }}
      now={now}
      loadError={loadError}
      availableNow={features.availableNow}
    />
  );
}
