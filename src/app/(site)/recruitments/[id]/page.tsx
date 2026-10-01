import { notFound } from 'next/navigation';
import { getRecruitment } from '@/lib/queries';
import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import type { JoinState } from '@/lib/capacity';
import { siteUrl } from '@/lib/env';
import { authStateOf } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { RecruitmentDetailView } from '@/components/views/RecruitmentDetailView';
import type { MemberContact, Message, Participation } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const r = await getRecruitment(id).catch(() => null);
  return r ? { title: r.title } : {};
}

export default async function RecruitmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const r = await getRecruitment(id).catch(() => null);
  if (!r) notFound();

  const viewer = await getViewerSafe();
  const supabase = await createClient();
  const isOwner = viewer?.userId === r.owner_id;

  let participations: Participation[] = [];
  let myState: JoinState = 'none';
  let roomCode: string | null = null;
  let contacts: MemberContact[] = [];
  let messages: Message[] = [];

  if (viewer) {
    const { data } = await supabase
      .from('participations')
      .select('id, recruitment_id, user_id, status, created_at, profile:profiles!participations_user_id_fkey(id, display_name, rank_band, play_roles, vc, tags)')
      .eq('recruitment_id', id)
      .order('created_at', { ascending: true });
    participations = (data ?? []) as unknown as Participation[];
    myState = (participations.find((p) => p.user_id === viewer.userId)?.status as JoinState) ?? 'none';
  }

  if (viewer && (isOwner || myState === 'approved')) {
    const [rc, ct, ms] = await Promise.all([
      supabase.rpc('get_room_code', { p_recruitment_id: id }),
      supabase.rpc('get_member_contacts', { p_recruitment_id: id }),
      supabase
        .from('messages')
        .select('id, recruitment_id, user_id, body, created_at')
        .eq('recruitment_id', id)
        .order('created_at', { ascending: true })
        .limit(200),
    ]);
    roomCode = (rc.data as string | null) ?? null;
    contacts = (ct.data as MemberContact[] | null) ?? [];
    messages = (ms.data as Message[] | null) ?? [];
  }

  return (
    <RecruitmentDetailView
      r={r}
      now={new Date()}
      auth={authStateOf(viewer)}
      viewerId={viewer?.userId ?? null}
      participations={participations}
      myState={myState}
      roomCode={roomCode}
      contacts={contacts}
      messages={messages}
      src={sanitizeSrc(sp.src)}
      created={Boolean(sp.created)}
      justJoined={Boolean(sp.joined)}
      siteUrl={siteUrl()}
    />
  );
}
