import { getSessionClaims } from '@/lib/auth';
import { getViewerSafe } from '@/lib/viewer-safe';
import { GuestMeView } from '@/components/views/GuestMeView';
import { createClient } from '@/lib/supabase/server';
import { RECRUIT_BASE_COLUMNS } from '@/lib/queries';
import { MeView, type Mate } from '@/components/views/MeView';
import { accountKindOf, isTransferEmail } from '@/lib/transfer';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'マイページ' };

const OWNER_COLUMNS = `${RECRUIT_BASE_COLUMNS}, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band, play_roles)`;

export default async function MePage() {
  const viewer = await getViewerSafe();
  if (!viewer || !viewer.profile) return <GuestMeView />;
  const supabase = await createClient();
  const now = new Date();
  const [{ data: mine }, { data: parts }, { data: contacts }, { data: account }, { data: mateRows }, { data: follows }] = await Promise.all([
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
    supabase
      .from('play_mates')
      .select('mate_id, times, last_played_at, mate:profiles!play_mates_mate_id_fkey(id, display_name, rank_band, play_roles, banned_at, hidden_at)')
      .eq('user_id', viewer.userId)
      .order('last_played_at', { ascending: false })
      .limit(30),
    supabase.from('follows').select('followee_id').eq('follower_id', viewer.userId),
  ]);
  const followSet = new Set(((follows ?? []) as { followee_id: string }[]).map((f) => f.followee_id));
  // 削除された方 (行ごと消える)・BAN された方・通報で非表示の方は出さない。管理者は RLS で全員見えるので、ここでも除く
  type MateRow = { times: number; mate: (Omit<Mate, 'times' | 'following'> & { banned_at: string | null; hidden_at: string | null }) | null };
  const mates = ((mateRows ?? []) as unknown as MateRow[])
    .filter((m): m is MateRow & { mate: NonNullable<MateRow['mate']> } => Boolean(m.mate && !m.mate.banned_at && !m.mate.hidden_at))
    .map(({ times, mate: { banned_at: _b, hidden_at: _h, ...mate } }) => ({ ...mate, times, following: followSet.has(mate.id) }));
  const joined = ((parts ?? []) as unknown as { status: JoinState; recruitment: Recruitment | null }[]).filter(
    (p): p is { status: JoinState; recruitment: Recruitment } =>
      Boolean(p.recruitment) && new Date(p.recruitment!.ends_at).getTime() > now.getTime(),
  );
  const claims = await getSessionClaims();
  const accountKind = accountKindOf({ email: claims?.email, is_anonymous: claims?.isAnonymous });
  const hasContacts = Boolean(contacts && (contacts.contact_discord || contacts.contact_x || contacts.contact_ingame));
  return (
    <MeView
      userId={viewer.userId}
      profile={viewer.profile!}
      loginId={(account as { login_id: string } | null)?.login_id ?? null}
      accountKind={accountKind}
      transferEmail={isTransferEmail(claims?.email) ? claims!.email! : null}
      isAdmin={viewer.isAdmin}
      hasContacts={hasContacts}
      mine={(mine ?? []) as unknown as Recruitment[]}
      joined={joined}
      mates={mates}
      now={now}
    />
  );
}
