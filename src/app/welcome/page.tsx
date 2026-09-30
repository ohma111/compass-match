import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';
import { displayNameFromMetadata } from '@/lib/display-name';
import { OnboardingForm } from './OnboardingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'はじめる' };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/');
  const viewer = await requireViewer(`/welcome?next=${encodeURIComponent(next)}`, { allowNoProfile: true });
  if (viewer.profile) redirect(next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const suggested = displayNameFromMetadata(data.user?.user_metadata);

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">WELCOME</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-snug">
          ようこそ!
          <br />
          あと1ステップで遊べます
        </h1>
        <p className="mt-2 text-sm text-muted">自己紹介や連絡先は、あとからマイページで追加できます。</p>
      </div>
      <OnboardingForm next={next} suggestedName={suggested} />
    </div>
  );
}
