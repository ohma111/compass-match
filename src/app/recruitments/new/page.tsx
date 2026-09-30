import { getViewerSafe } from '@/lib/viewer-safe';
import { authStateOf } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { CreateRecruitmentForm } from './CreateRecruitmentForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: '募集する' };

// ログインしていなくても画面は開ける。「募集する」を押した時点でログイン → 初回登録 → 自動で投稿を再開する
export default async function NewRecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewerSafe();
  const auth = authStateOf(viewer);
  const sp = await searchParams;
  if (auth === 'restricted') {
    return <p className="alert-error">このアカウントは現在募集を作成できません。</p>;
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="section-title">NEW PARTY</p>
        <h1 className="mt-1 text-2xl font-extrabold">募集する</h1>
        <p className="mt-1 text-sm text-muted">タップで選んで、下のボタンを押すだけ。終了は開始の1時間後に自動で設定されます。</p>
      </div>
      <CreateRecruitmentForm auth={auth} serverNow={new Date().toISOString()} src={sanitizeSrc(sp.src) ?? ''} />
    </div>
  );
}
