import { requireViewer, isRestricted } from '@/lib/auth';
import { RecruitmentForm } from './RecruitmentForm';
import { toJstLocalInput } from '@/lib/time';

export const metadata = { title: '募集する' };

function defaultStart(now = new Date()): string {
  // 次の30分区切り (JST表示)
  const ms = Math.ceil((now.getTime() + 5 * 60_000) / (30 * 60_000)) * 30 * 60_000;
  return toJstLocalInput(new Date(ms));
}

export default async function NewRecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer('/recruitments/new');
  const sp = await searchParams;
  if (isRestricted(viewer.profile)) {
    return <p className="alert-error">このアカウントは現在募集を作成できません。</p>;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">募集する</h1>
      <RecruitmentForm defaultStart={defaultStart()} src={sp.src ?? ''} />
    </div>
  );
}
