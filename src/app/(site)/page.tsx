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
  const viewer = await getViewerSafe();
  let items: Recruitment[] = [];
  let states: Record<string, JoinState> = {};
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      items = await listRecruitments({ purpose: filter.purpose, soon: filter.soon }, now);
      if (viewer) states = await myJoinStates(viewer.userId, items.map((r) => r.id));
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
