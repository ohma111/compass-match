import Link from '@/components/Link';
import { ChevronLeft } from 'lucide-react';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'プロフィール編集' };

export default async function ProfileEditPage() {
  const viewer = await requireViewer('/profile/edit');
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from('profile_contacts')
    .select('contact_discord, contact_x, contact_ingame')
    .eq('user_id', viewer.userId)
    .maybeSingle();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/me" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-bold text-slate">
        <ChevronLeft className="size-4" aria-hidden />
        マイページ
      </Link>
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[34px]">プロフィール編集</h1>
      <ProfileForm profile={viewer.profile!} contacts={contacts ?? null} />
    </div>
  );
}
