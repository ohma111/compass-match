// 参加の前に聞くことの材料 (サーバーの画面からもブラウザからも使うので 'use client' のファイルに置かない)
import type { Recruitment } from './types';

/** v15: デキレを聞く募集の条件と、ほかの募集に参加中・募集中か */
export interface JoinExtra {
  deck?: { minDeck: number | null; minCollab: number | null } | null;
  busyElsewhere?: boolean;
}

/** 募集から JoinExtra を作る */
export function joinExtraOf(r: Pick<Recruitment, 'owner_deck_level' | 'min_deck_level' | 'min_collab'>, busyElsewhere = false): JoinExtra {
  return {
    deck: r.owner_deck_level != null ? { minDeck: r.min_deck_level ?? null, minCollab: r.min_collab ?? null } : null,
    busyElsewhere,
  };
}

