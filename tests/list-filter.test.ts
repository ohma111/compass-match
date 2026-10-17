import { describe, expect, it } from 'vitest';
import { applyListView, DEFAULT_VIEW, listHref } from '@/lib/list-filter';
import type { Recruitment } from '@/lib/types';

function rec(over: Partial<Recruitment>): Recruitment {
  return {
    id: over.id ?? 'x',
    owner_id: 'o',
    title: 't',
    purpose: 'rank',
    starts_at: '2026-10-10T12:00:00Z',
    ends_at: '2026-10-10T13:00:00Z',
    capacity: 3,
    min_rank: null,
    vc: 'any',
    tags: [],
    note: '',
    status: 'open',
    join_mode: 'instant',
    stance: 'fun',
    approved_count: 0,
    hidden_at: null,
    created_at: '2026-10-10T11:00:00Z',
    owner: { id: 'o', display_name: 'n', rank_band: 's3', play_roles: [], avatar: null },
    ...over,
  } as Recruitment;
}

describe('applyListView', () => {
  const a = rec({ id: 'a', approved_count: 2, status: 'full' });
  const b = rec({ id: 'b', min_rank: 's7', vc: 'on', owner: { id: 'o', display_name: 'n', rank_band: 's9', play_roles: [], avatar: null } });
  const c = rec({ id: 'c', capacity: 6, purpose: 'custom', approved_count: 1, stance: 'win' });
  const items = [a, b, c];
  it('満員は一番下 (切り替えで隠す)', () => {
    expect(applyListView(items, DEFAULT_VIEW, null).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(applyListView(items, { ...DEFAULT_VIEW, sort: 'rank' }, null).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(applyListView(items, { ...DEFAULT_VIEW, hideFull: true }, null).map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('参加できるランクだけ (ランクが分からなければ絞らない)', () => {
    expect(applyListView(items, { ...DEFAULT_VIEW, eligible: true, hideFull: true }, 's5').map((r) => r.id)).toEqual(['c']);
    expect(applyListView(items, { ...DEFAULT_VIEW, eligible: true, hideFull: true }, null)).toHaveLength(2);
  });
  it('VC・遊び方', () => {
    expect(applyListView(items, { ...DEFAULT_VIEW, vc: 'on' }, null).map((r) => r.id)).toEqual(['b']);
    expect(applyListView(items, { ...DEFAULT_VIEW, stance: 'win', hideFull: true }, null).map((r) => r.id)).toEqual(['c']);
  });
  it('VC の絞り込み: on は on・listen・any、listen は listen・any、off は off・any', () => {
    const mk = (vc: 'on' | 'listen' | 'any' | 'off') => rec({ id: vc, vc });
    const all = [mk('on'), mk('listen'), mk('any'), mk('off')];
    const ids = (vc?: 'on' | 'listen' | 'off') => applyListView(all, { ...DEFAULT_VIEW, vc }, null).map((r) => r.id).sort();
    expect(ids('on')).toEqual(['any', 'listen', 'on']);
    expect(ids('listen')).toEqual(['any', 'listen']);
    expect(ids('off')).toEqual(['any', 'off']);
    expect(ids(undefined)).toEqual(['any', 'listen', 'off', 'on']);
  });
  it('並べ替え: 空きが多い順・募集者のランクが高い順 (同じなら開始順のまま)', () => {
    expect(applyListView(items, { ...DEFAULT_VIEW, sort: 'left', hideFull: true }, null).map((r) => r.id)).toEqual(['c', 'b']);
    expect(applyListView(items, { ...DEFAULT_VIEW, sort: 'rank', hideFull: true }, null).map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('listHref', () => {
  it('既定の値は URL に入れない', () => {
    expect(listHref(DEFAULT_VIEW)).toBe('/');
    expect(listHref(DEFAULT_VIEW, { sort: 'left', purpose: 'custom' })).toBe('/?purpose=custom&sort=left');
    expect(listHref(DEFAULT_VIEW, { hideFull: true })).toBe('/?nofull=1');
  });
});
