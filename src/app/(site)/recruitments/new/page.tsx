import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { authStateOf } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { NewRecruitmentView } from '@/components/views/NewRecruitmentView';

export const dynamic = 'force-dynamic';
export const metadata = { title: '募集する' };

// ログインしていなくても画面は開ける。「募集する」を押した時点で登録/ログイン → 自動で投稿を再開する
export default async function NewRecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewerSafe();
  const auth = authStateOf(viewer);
  // VC ありの募集で使う Discord のユーザー名 (登録済みなら入れておく)
  let discord = '';
  if (viewer?.profile) {
    const supabase = await createClient();
    const { data } = await supabase.from('profile_contacts').select('contact_discord').eq('user_id', viewer.userId).maybeSingle();
    discord = (data as { contact_discord: string | null } | null)?.contact_discord ?? '';
  }
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
      discord={discord}
      ownerRoles={viewer?.profile?.play_roles ?? []}
    />
  );
}
