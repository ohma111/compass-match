import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { isAccountServiceConfigured } from '@/lib/env';
import { getViewerSafe } from '@/lib/viewer-safe';
import { SignupView } from '@/components/views/AuthViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'はじめる' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewerSafe();
  if (viewer?.profile) redirect(next);
  if (viewer) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return <SignupView next={next} configured={isAccountServiceConfigured()} resuming={next !== '/'} />;
}
