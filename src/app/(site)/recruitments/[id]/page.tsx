import { notFound } from 'next/navigation';
import { blockedRecruitmentIds, getRecruitment } from '@/lib/queries';
import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import type { JoinState } from '@/lib/capacity';
import { siteUrl } from '@/lib/env';
import { authStateOf, getSessionClaims } from '@/lib/auth';
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
  // 募集・ログイン情報・参加者は互いに依存しないので同時に取る。
  // 部屋番号・連絡先・チャットは「主催者か参加確定者」だけが見られる (DB 側で拒否される) が、
  // 往復を1回減らすため、ログインしていれば先に問い合わせておき、見せてよい場合だけ使う。
  const supabase = await createClient();
  const claims = await getSessionClaims();
  const signedIn = Boolean(claims);
  const [r, viewer, partsRes, rc, ct, ms, blocked, myBlocks] = await Promise.all([
    getRecruitment(id).catch(() => null),
    getViewerSafe(),
    signedIn
      ? supabase
          .from('participations')
          .select('id, recruitment_id, user_id, status, created_at, profile:profiles!participations_user_id_fkey(id, display_name, rank_band, play_roles, vc, tags)')
          .eq('recruitment_id', id)
          .order('created_at', { ascending: true })
      : null,
    signedIn ? supabase.rpc('get_room_code', { p_recruitment_id: id }) : null,
    signedIn ? supabase.rpc('get_member_contacts', { p_recruitment_id: id }) : null,
    signedIn
      ? supabase
          .from('messages')
          .select('id, recruitment_id, user_id, body, created_at')
          .eq('recruitment_id', id)
          .order('created_at', { ascending: true })
          .limit(200)
      : null,
    signedIn ? blockedRecruitmentIds([id]) : Promise.resolve(new Set<string>()),
    signedIn && claims ? supabase.from('blocks').select('blocked_id').eq('blocker_id', claims.userId) : null,
  ]);
  if (!r) notFound();
  const isOwner = viewer?.userId === r.owner_id;

  let participations: Participation[] = [];
  let myState: JoinState = 'none';
  let roomCode: string | null = null;
  let contacts: MemberContact[] = [];
  let messages: Message[] = [];

  if (viewer) {
    participations = (partsRes?.data ?? []) as unknown as Participation[];
    myState = (participations.find((p) => p.user_id === viewer.userId)?.status as JoinState) ?? 'none';
  }

  if (viewer && (isOwner || myState === 'approved')) {
    roomCode = (rc?.data as string | null) ?? null;
    contacts = (ct?.data as MemberContact[] | null) ?? [];
    messages = (ms?.data as Message[] | null) ?? [];
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
      blockedHere={blocked.has(id)}
      blockedIds={((myBlocks?.data ?? []) as { blocked_id: string }[]).map((b) => b.blocked_id)}
    />
  );
}
