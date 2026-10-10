import type { Avatar, Stance, JoinMode, MoodTag, PlayRole, ProfileVc, Purpose, RankBand, RecruitStatus, RecruitVc } from './constants';

export interface Profile {
  id: string;
  display_name: string;
  rank_band: RankBand | null;
  play_roles: PlayRole[];
  characters: string[];
  purposes: Purpose[];
  vc: ProfileVc;
  tags: MoodTag[];
  bio: string;
  hidden_at: string | null;
  suspended_at: string | null;
  banned_at: string | null;
  created_at: string;
  /** false = ユーザーIDで登録して、まだランク帯を選んでいない */
  rank_confirmed?: boolean;
  /** v11: 選んだアイコン (null ならロールか模様) */
  avatar?: Avatar | null;
}

export interface Recruitment {
  id: string;
  owner_id: string;
  stance?: Stance;
  title: string;
  purpose: Purpose;
  starts_at: string;
  ends_at: string;
  capacity: number;
  min_rank: RankBand | null;
  vc: RecruitVc;
  tags: MoodTag[];
  note: string;
  status: RecruitStatus;
  join_mode: JoinMode;
  approved_count: number;
  hidden_at: string | null;
  created_at: string;
  /** v15: 2固定でも可 (バトルアリーナ・フリーバトル) */
  duo_ok?: boolean;
  /** v15: ほしいロール (任意) */
  wanted_roles?: PlayRole[];
  /** v15: バトルアリーナの承認制だけ。募集者のデキレ・コラボ数と、参加の条件 */
  owner_deck_level?: number | null;
  owner_collab?: number | null;
  min_deck_level?: number | null;
  min_collab?: number | null;
  /** v16: 募集者が使うロール */
  owner_roles?: PlayRole[];
  /** v16: 2固定中 (2人で遊びながら、もう1人を待つ) */
  duo_playing?: boolean;
  /** v16: 募集者に「続けますか」を聞いた時刻 (5分で取り消し) */
  close_check_at?: string | null;
  owner?: (Pick<Profile, 'id' | 'display_name' | 'rank_band'> & { play_roles?: Profile['play_roles']; avatar?: Avatar | null }) | null;
}

export interface Participation {
  id: string;
  recruitment_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  /** v15: デキレを聞く募集で申告した値 */
  deck_level?: number | null;
  collab?: number | null;
  profile?: Pick<Profile, 'id' | 'display_name' | 'rank_band' | 'play_roles' | 'vc' | 'tags' | 'avatar'> | null;
}

export interface Message {
  id: string;
  recruitment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  /** 送った方の表示名 (参加者でない方の発言もあるため) */
  author?: { display_name: string } | null;
}

export interface MemberContact {
  user_id: string;
  display_name: string;
  is_owner: boolean;
  contact_discord: string | null;
  contact_x: string | null;
  contact_ingame: string | null;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** 部屋番号と、最後に変えた方・時刻 (参加が確定したメンバーだけ) */
export interface RoomInfo {
  code: string | null;
  updated_at: string | null;
  updated_by: string | null;
}
