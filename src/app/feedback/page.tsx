import { FeedbackForm } from '@/components/FeedbackForm';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'フィードバック' };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">フィードバック</h1>
      <p className="text-sm text-muted">
        ひとりで運営しています。気づいたこと・困ったことを気軽に送ってください。返信はできませんが、すべて目を通します。
        ユーザーとのトラブルは、該当ページの「通報」ボタンからお知らせください。
      </p>
      <FeedbackForm page={safeNext(sp.from, '')} />
    </div>
  );
}
