import { safeNext } from '@/lib/safe-next';
import { isAccountServiceConfigured } from '@/lib/env';
import { RecoverView } from '@/components/views/AuthViews';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'パスワードを忘れたとき' };

export default async function RecoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <RecoverView next={safeNext(sp.next)} configured={isAccountServiceConfigured()} />;
}
