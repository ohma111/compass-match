// ホームの一覧の絞り込み・並べ替え (ブラウザ・サーバー共通の純粋な関数)。
// DB には目的と「30分以内」だけを渡し (未ログインの方の一覧は全員で共有しているため)、
// それ以外の条件はここで取り出した一覧に当てる。
import { isFull, remainingSlots } from './capacity';
import { meetsMinRank, rankValue, type Purpose, type RankBand, type RecruitVc, type Stance } from './constants';
import type { Recruitment } from './types';

export const LIST_SORTS = ['start', 'left', 'rank'] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const LIST_SORT_LABELS: Record<ListSort, string> = {
  start: '予定が先',
  left: '空きが多い順',
  rank: '募集者のランクが高い順',
};

export interface ListView {
  purpose: Purpose | 'all';
  soon: boolean;
  eligible: boolean;
  vc?: RecruitVc;
  stance?: Stance;
  sort: ListSort;
}

export const DEFAULT_VIEW: ListView = { purpose: 'all', soon: false, eligible: false, sort: 'start' };

/** 目的・30分以内以外の条件を使っているか (時間割の区切りを出すか、空のときの文言) */
export function hasExtraFilter(v: ListView): boolean {
  return v.eligible || Boolean(v.vc) || Boolean(v.stance) || v.sort !== 'start';
}

export function listHref(v: ListView, patch: Partial<ListView> = {}): string {
  const n = { ...v, ...patch };
  const p = new URLSearchParams();
  if (n.purpose !== 'all') p.set('purpose', n.purpose);
  if (n.soon) p.set('soon', '1');
  if (n.eligible) p.set('eligible', '1');
  if (n.vc) p.set('vc', n.vc);
  if (n.stance) p.set('stance', n.stance);
  if (n.sort !== 'start') p.set('sort', n.sort);
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/**
 * 一覧に条件を当てて並べ替える。eligible は自分のランクが分かるときだけ効く。
 * 既定の並び (start) は、時刻を決めた「これからの募集」を上に (開始が近い順)、始まっている募集 (NOW) をその下に
 * (古い順) 置く。あとから出た「今すぐ」に人が流れて、先に時刻を決めた募集に人が来ないという声への対応 (v15)。
 */
export function applyListView(items: Recruitment[], v: ListView, myRank: RankBand | null | undefined, now: Date = new Date()): Recruitment[] {
  let out = items.filter((r) => {
    // 満員の募集は出さない (自分の募集・参加中の募集は一覧の上の「参加中・自分の募集」に出る)
    if (r.status === 'full' || isFull(r.capacity, r.approved_count)) return false;
    if (v.eligible && myRank && !meetsMinRank(myRank, r.min_rank)) return false;
    if (v.vc && r.vc !== v.vc) return false;
    if (v.stance && r.stance !== v.stance) return false;
    return true;
  });
  if (v.sort === 'start') {
    const t = now.getTime();
    const at = (r: Recruitment) => new Date(r.starts_at).getTime();
    out = [...out.filter((r) => at(r) > t).sort((a, b) => at(a) - at(b)), ...out.filter((r) => at(r) <= t).sort((a, b) => at(a) - at(b))];
  } else if (v.sort === 'left') {
    out = [...out].sort((a, b) => remainingSlots(b.capacity, b.approved_count) - remainingSlots(a.capacity, a.approved_count));
  } else if (v.sort === 'rank') {
    const rv = (r: Recruitment) => (r.owner?.rank_band ? rankValue(r.owner.rank_band) : -1);
    out = [...out].sort((a, b) => rv(b) - rv(a));
  }
  return out;
}
