import type { JoinMode, MoodTag, PlayRole, ProfileVc, Purpose, RankBand, RecruitStatus, RecruitVc } from './constants';

export interface Profile {
  id: string;
  display_name: string;
  rank_band: RankBand;
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
}

export interface Recruitment {
  id: string;
  owner_id: string;
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
  owner?: Pick<Profile, 'id' | 'display_name' | 'rank_band'> | null;
}

export interface Participation {
  id: string;
  recruitment_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  profile?: Pick<Profile, 'id' | 'display_name' | 'rank_band' | 'play_roles' | 'vc' | 'tags'> | null;
}

export interface Message {
  id: string;
  recruitment_id: string;
  user_id: string;
  body: string;
  created_at: string;
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
