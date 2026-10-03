import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';

// v4: 登録画面はなくなった (初めての「参加する」「募集する」でシートが開く)。古いリンクは元の場所へ戻す
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  redirect(safeNext(sp.next));
}
