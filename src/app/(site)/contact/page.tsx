import { FeedbackForm } from '@/components/FeedbackForm';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'お問い合わせ' };

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[34px]">お問い合わせ</h1>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate marker:text-ink/40">
        <li>ほかの利用者の投稿や行為は、各ページの「通報」からお知らせください。</li>
        <li>アカウントと情報の削除を希望する場合は、そのアカウントでログインしている端末から「削除希望」とお送りください。</li>
        <li>返信が必要な場合は、X のユーザー名 (@ から始まるもの) を書き、DM を受け取れる設定にしてください。運営者から X の DM でお返事します。</li>
      </ul>
      <FeedbackForm page={safeNext(sp.from, '/contact')} placeholder="不具合、ほしい機能、削除の希望など (X のユーザー名のほかは、個人情報を書かないでください)" />
    </div>
  );
}
