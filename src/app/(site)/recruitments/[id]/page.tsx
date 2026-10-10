import { notFound } from 'next/navigation';
import { blockedRecruitmentIds, getRecruitment, getRecruitmentPublic } from '@/lib/queries';
import { getViewerSafe } from '@/lib/viewer-safe';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { effectiveStatus, seatLabel, type JoinState } from '@/lib/capacity';
import { PURPOSE_LABELS, RECRUIT_STATUS_LABELS } from '@/lib/constants';
import { formatJst } from '@/lib/time';
import { siteUrl } from '@/lib/env';
import { authStateOf, getSessionClaims } from '@/lib/auth';
import { sanitizeSrc } from '@/lib/src-param';
import { RecruitmentDetailView } from '@/components/views/RecruitmentDetailView';
import type { MemberContact, Message, Participation, RoomInfo } from '@/lib/types';

/** 部屋番号と、最後に変えた方・時刻。migration 22 の get_room_info がなければ番号だけ読む */
async function readRoomInfo(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<RoomInfo | null> {
  const info = await supabase.rpc('get_room_info', { p_recruitment_id: id });
  if (!info.error) return (info.data as RoomInfo | null) ?? null;
  const rc = await supabase.rpc('get_room_code', { p_recruitment_id: id });
  return rc.data ? { code: rc.data as string, updated_at: null, updated_by: null } : null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 募集は15日で消えるので検索には載せない (共有カードは出す。X などのカード取得は noindex でも行われる)
  const robots = { index: false, follow: true };
  if (!uuidSchema.safeParse(id).success) return { robots };
  const signedIn = Boolean(await getSessionClaims().catch(() => null));
  const r = await (signedIn ? getRecruitment(id) : getRecruitmentPublic(id)).catch(() => null);
  if (!r) return { robots };
  const status = effectiveStatus(r.status, r.ends_at);
  const seats = status === 'open' || status === 'full' ? seatLabel(r.capacity, r.approved_count) : RECRUIT_STATUS_LABELS[status];
  const description = `${PURPOSE_LABELS[r.purpose] ?? ''} ・ ${formatJst(r.starts_at)} 開始 ・ ${seats}`;
  return { title: r.title, description, robots, openGraph: { title: r.title, description, type: 'website', siteName: 'JOIN◆COMPASS', locale: 'ja_JP' } };
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
  const nowIso = new Date().toISOString();
  const [r, viewer, partsRes, rc, ct, ms, blocked, myBlocks, mute, myOwn, myJoins] = await Promise.all([
    (signedIn ? getRecruitment(id) : getRecruitmentPublic(id)).catch(() => null),
    getViewerSafe(),
    signedIn
      ? supabase
          .from('participations')
          .select('id, recruitment_id, user_id, status, created_at, deck_level, collab, profile:profiles!participations_user_id_fkey(id, display_name, rank_band, play_roles, vc, tags, avatar)')
          .eq('recruitment_id', id)
          .order('created_at', { ascending: true })
      : null,
    signedIn ? readRoomInfo(supabase, id).catch(() => null) : null,
    signedIn ? supabase.rpc('get_member_contacts', { p_recruitment_id: id }) : null,
    signedIn
      ? supabase
          .from('messages')
          .select('id, recruitment_id, user_id, body, created_at, author:profiles!messages_user_id_fkey(display_name)')
          .eq('recruitment_id', id)
          .order('created_at', { ascending: true })
          .limit(200)
      : null,
    signedIn ? blockedRecruitmentIds([id]) : Promise.resolve(new Set<string>()),
    signedIn && claims ? supabase.from('blocks').select('blocked_id').eq('blocker_id', claims.userId) : null,
    // チャットの通知を止めているか (表がなければ止めていない扱い)
    signedIn ? supabase.from('chat_mutes').select('recruitment_id').eq('recruitment_id', id).maybeSingle() : null,
    // ほかに募集中・参加中の募集があるか (参加の前に確かめるため)
    signedIn && claims
      ? supabase.from('recruitments').select('id').eq('owner_id', claims.userId).in('status', ['open', 'full']).gt('ends_at', nowIso).neq('id', id).limit(1)
      : null,
    signedIn && claims
      ? supabase
          .from('participations')
          .select('recruitment_id, recruitment:recruitments!inner(status, ends_at)')
          .eq('user_id', claims.userId)
          .in('status', ['pending', 'approved'])
          .neq('recruitment_id', id)
          .in('recruitment.status', ['open', 'full'])
          .gt('recruitment.ends_at', nowIso)
          .limit(1)
      : null,
  ]);
  if (!r) notFound();
  const isOwner = viewer?.userId === r.owner_id;

  let participations: Participation[] = [];
  let myState: JoinState = 'none';
  let room: RoomInfo | null = null;
  let contacts: MemberContact[] = [];
  let messages: Message[] = [];

  if (viewer) {
    participations = (partsRes?.data ?? []) as unknown as Participation[];
    myState = (participations.find((p) => p.user_id === viewer.userId)?.status as JoinState) ?? 'none';
  }

  if (viewer && (isOwner || myState === 'approved')) {
    room = rc ?? null;
    contacts = (ct?.data as MemberContact[] | null) ?? [];
  }
  // チャットはプロフィールのある方なら読める (見てよいかは DB の RLS が決める)
  if (viewer?.profile) messages = (ms?.data as unknown as Message[] | null) ?? [];

  return (
    <RecruitmentDetailView
      r={r}
      now={new Date()}
      auth={authStateOf(viewer)}
      viewerId={viewer?.userId ?? null}
      participations={participations}
      myState={myState}
      room={room}
      chatMuted={Boolean(mute?.data)}
      busyElsewhere={Boolean(myOwn?.data?.length || myJoins?.data?.length)}
      anonymous={Boolean(claims?.isAnonymous)}
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
