import { isSupabaseConfigured } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { TransferView } from '@/components/views/AuthViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ログイン' };

export default async function TransferPage() {
  const viewer = await getViewerSafe();
  return <TransferView configured={isSupabaseConfigured()} hasProfileHere={Boolean(viewer?.profile)} />;
}
