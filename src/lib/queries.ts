import 'server-only';
import { cache } from 'react';
import { createClient } from './supabase/server';
import type { Purpose } from './constants';
import type { JoinState } from './capacity';
import type { Recruitment } from './types';

export const RECRUIT_BASE_COLUMNS =
  'id, owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, status, join_mode, approved_count, hidden_at, created_at';
const RECRUIT_COLUMNS = `${RECRUIT_BASE_COLUMNS}, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band)`;

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
