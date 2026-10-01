import { getViewerSafe } from '@/lib/viewer-safe';
import { authStateOf } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { NewRecruitmentView } from '@/components/views/NewRecruitmentView';

export const dynamic = 'force-dynamic';
export const metadata = { title: '募集する' };

// ログインしていなくても画面は開ける。「募集する」を押した時点で登録/ログイン → 自動で投稿を再開する
export default async function NewRecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewerSafe();
  const auth = authStateOf(viewer);
  const sp = await searchParams;
  if (auth === 'restricted') {
    return <p className="alert-error">このアカウントは現在募集を作成できません。</p>;
  }
  return (
    <NewRecruitmentView
      auth={auth}
      serverNow={new Date().toISOString()}
      src={sanitizeSrc(sp.src) ?? ''}
      ownerName={viewer?.profile?.display_name ?? null}
    />
  );
}
