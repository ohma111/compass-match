import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from './supabase/server';
import { createPublicClient } from './supabase/public';
import type { Purpose } from './constants';
import type { JoinState } from './capacity';
import type { Recruitment } from './types';

export const RECRUIT_BASE_COLUMNS =
  'id, owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, status, join_mode, stance, approved_count, hidden_at, created_at, duo_ok, wanted_roles, owner_deck_level, owner_collab, min_deck_level, min_collab';
const RECRUIT_COLUMNS = `${RECRUIT_BASE_COLUMNS}, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band, play_roles, avatar)`;

/** 「今すぐ」フィルタ: 開始が30分以内、または開催中 */
export const SOON_WINDOW_MIN = 30;

export interface ListFilter {
  purpose: Purpose | 'all';
  soon: boolean;
  limit?: number;
}

/** 進行中・これからの募集 (近い開始時刻順)。RLSでブロック相手・非表示は自動的に除外される */
export async function listRecruitments(filter: ListFilter, now: Date = new Date()): Promise<Recruitment[]> {
  const supabase = await createClient();
  let q = supabase
    .from('recruitments')
    .select(RECRUIT_COLUMNS)
    .in('status', ['open', 'full'])
    .gt('ends_at', now.toISOString())
    .is('hidden_at', null)
    .order('starts_at', { ascending: true })
    .limit(filter.limit ?? 60);
  if (filter.soon) q = q.lte('starts_at', new Date(now.getTime() + SOON_WINDOW_MIN * 60_000).toISOString());
  if (filter.purpose !== 'all') q = q.eq('purpose', filter.purpose);
  const { data, error } = await q;
  if (error) throw new Error('募集一覧の取得に失敗しました');
  return (data ?? []) as unknown as Recruitment[];
}

/**
 * 未ログインの方に見せる一覧。全員で同じなので15秒まとめて使う (アクセスが集中しても DB への問い合わせは15秒に1回)。
 * ログインしている方はブロックの関係で見え方が変わるので listRecruitments を使う。
 */
export const listRecruitmentsPublic = unstable_cache(
  async (purpose: ListFilter['purpose'], soon: boolean): Promise<Recruitment[]> => {
    const now = new Date();
    let q = createPublicClient()
      .from('recruitments')
      .select(RECRUIT_COLUMNS)
      .in('status', ['open', 'full'])
      .gt('ends_at', now.toISOString())
      .is('hidden_at', null)
      .order('starts_at', { ascending: true })
      .limit(60);
    if (soon) q = q.lte('starts_at', new Date(now.getTime() + SOON_WINDOW_MIN * 60_000).toISOString());
    if (purpose !== 'all') q = q.eq('purpose', purpose);
    const { data, error } = await q;
    if (error) throw new Error('募集一覧の取得に失敗しました');
    return (data ?? []) as unknown as Recruitment[];
  },
  ['recruitments-public-v1'],
  { revalidate: 15 },
);

/** 未ログインの方 (共有リンクから来た方・X のカード取得) に見せる募集。10秒まとめて使う */
export const getRecruitmentPublic = unstable_cache(
  async (id: string): Promise<Recruitment | null> => {
    const { data, error } = await createPublicClient().from('recruitments').select(RECRUIT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error('募集の取得に失敗しました');
    return (data as unknown as Recruitment) ?? null;
  },
  ['recruitment-public-v1'],
  { revalidate: 10 },
);

/** generateMetadata とページ本体で同じ募集を2回取らないよう、1リクエスト内でキャッシュする */
export const getRecruitment = cache(async (id: string): Promise<Recruitment | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from('recruitments').select(RECRUIT_COLUMNS).eq('id', id).maybeSingle();
  return (data as unknown as Recruitment) ?? null;
});

/** 表示中の募集に対する自分の参加状態 */
export async function myJoinStates(userId: string, recruitmentIds: string[]): Promise<Record<string, JoinState>> {
  if (recruitmentIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from('participations')
    .select('recruitment_id, status')
    .eq('user_id', userId)
    .in('recruitment_id', recruitmentIds);
  const out: Record<string, JoinState> = {};
  for (const row of (data ?? []) as { recruitment_id: string; status: JoinState }[]) out[row.recruitment_id] = row.status;
  return out;
}

/** 表示中の募集のうち、自分がブロックしている人が募集者か参加者になっているもの */
export async function blockedRecruitmentIds(recruitmentIds: string[]): Promise<Set<string>> {
  if (recruitmentIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.rpc('recruitments_with_blocked', { p_ids: recruitmentIds });
  return new Set(((data ?? []) as unknown as string[]).map(String));
}
