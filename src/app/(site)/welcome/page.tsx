import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';
import { displayNameFromMetadata } from '@/lib/display-name';
import { OnboardingForm } from './OnboardingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'はじめる' };

// Discord で初めて入った人のプロフィール作成 (ユーザーIDで登録する人は /signup で一度に済む)
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/');
  const viewer = await requireViewer(`/welcome?next=${encodeURIComponent(next)}`, { allowNoProfile: true });
  if (viewer.profile) redirect(next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const suggested = displayNameFromMetadata(data.user?.user_metadata);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">あと1ステップです</h1>
      </div>
      <OnboardingForm next={next} suggestedName={suggested} />
    </div>
  );
}
