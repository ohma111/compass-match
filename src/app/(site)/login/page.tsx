import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { isSupabaseConfigured } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { LoginView } from '@/components/views/AuthViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ログイン' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewerSafe();
  if (viewer?.profile) redirect(next);
  if (viewer) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return <LoginView next={next} configured={isSupabaseConfigured()} resuming={next !== '/'} />;
}
