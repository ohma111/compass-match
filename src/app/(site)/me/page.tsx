import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RECRUIT_BASE_COLUMNS } from '@/lib/queries';
import { MeView } from '@/components/views/MeView';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'マイページ' };

const OWNER_COLUMNS = `${RECRUIT_BASE_COLUMNS}, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band)`;

export default async function MePage() {
  const viewer = await requireViewer('/me');
  const supabase = await createClient();
  const now = new Date();
  const [{ data: mine }, { data: parts }, { data: contacts }, { data: account }] = await Promise.all([
    supabase
      .from('recruitments')
      .select(OWNER_COLUMNS)
      .eq('owner_id', viewer.userId)
      .in('status', ['open', 'full'])
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(10),
    supabase
      .from('participations')
      .select(`status, recruitment:recruitments(${OWNER_COLUMNS})`)
      .eq('user_id', viewer.userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('profile_contacts').select('contact_discord, contact_x, contact_ingame').eq('user_id', viewer.userId).maybeSingle(),
    // ユーザーIDで登録した人だけ行がある (Discord で登録した人は null)
    supabase.from('accounts').select('login_id').eq('user_id', viewer.userId).maybeSingle(),
  ]);
  const joined = ((parts ?? []) as unknown as { status: JoinState; recruitment: Recruitment | null }[]).filter(
    (p): p is { status: JoinState; recruitment: Recruitment } =>
      Boolean(p.recruitment) && new Date(p.recruitment!.ends_at).getTime() > now.getTime(),
  );
  const hasContacts = Boolean(contacts && (contacts.contact_discord || contacts.contact_x || contacts.contact_ingame));
  return (
    <MeView
      userId={viewer.userId}
      profile={viewer.profile!}
      loginId={(account as { login_id: string } | null)?.login_id ?? null}
      isAdmin={viewer.isAdmin}
      hasContacts={hasContacts}
      mine={(mine ?? []) as unknown as Recruitment[]}
      joined={joined}
      now={now}
    />
  );
}
