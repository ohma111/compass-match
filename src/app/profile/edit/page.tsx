import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'プロフィール編集' };

export default async function ProfileEditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await requireViewer('/profile/edit', { allowNoProfile: true });
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from('profile_contacts')
    .select('contact_discord, contact_x, contact_ingame')
    .eq('user_id', viewer.userId)
    .maybeSingle();
  const isNew = !viewer.profile;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{isNew ? 'プロフィールを作成' : 'プロフィール編集'}</h1>
      {isNew && <p className="text-sm text-muted">はじめまして! 募集や参加のために、かんたんなプロフィールを作りましょう。</p>}
      <ProfileForm
        isNew={isNew}
        next={isNew ? safeNext(sp.next, '/') : safeNext(sp.next, '')}
        profile={viewer.profile}
        contacts={contacts ?? null}
      />
    </div>
  );
}
