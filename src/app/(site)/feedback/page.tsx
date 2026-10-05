import { FeedbackForm } from '@/components/FeedbackForm';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'フィードバック' };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[34px]">フィードバック</h1>
      <p className="text-sm text-slate">こちらから返信することはできません。ほかの利用者とのトラブルは、各ページの「通報」からお知らせください。</p>
      <FeedbackForm page={safeNext(sp.from, '')} />
    </div>
  );
}
