import 'server-only';
import { createClient } from './supabase/server';
import { jstDayRange } from './time';
import type { Purpose } from './constants';
import type { Recruitment } from './types';

const RECRUIT_COLUMNS =
  'id, owner_id, title, purpose, starts_at, ends_at, capacity, min_rank, vc, tags, note, status, approved_count, hidden_at, created_at, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band)';

export interface ListFilter {
  day: 'today' | 'tomorrow' | 'all';
  purpose: Purpose | 'all';
  limit?: number;
}

/** 進行中・これからの募集一覧 (RLSでブロック相手・非表示は自動的に除外される) */
export async function listRecruitments(filter: ListFilter): Promise<Recruitment[]> {
  const supabase = await createClient();
  const now = new Date();
  let q = supabase
    .from('recruitments')
    .select(RECRUIT_COLUMNS)
    .in('status', ['open', 'full'])
    .gt('ends_at', now.toISOString())
    .is('hidden_at', null)
    .order('starts_at', { ascending: true })
    .limit(filter.limit ?? 100);
  if (filter.day !== 'all') {
    const { start, end } = jstDayRange(filter.day === 'today' ? 0 : 1, now);
    // その日に開始する募集 + (今日の場合) すでに開催中の募集
    q = q.lt('starts_at', end.toISOString());
    if (filter.day === 'tomorrow') q = q.gte('starts_at', start.toISOString());
  }
  if (filter.purpose !== 'all') q = q.eq('purpose', filter.purpose);
  const { data, error } = await q;
  if (error) throw new Error('募集一覧の取得に失敗しました');
  return (data ?? []) as unknown as Recruitment[];
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('recruitments').select(RECRUIT_COLUMNS).eq('id', id).maybeSingle();
  return (data as unknown as Recruitment) ?? null;
}
