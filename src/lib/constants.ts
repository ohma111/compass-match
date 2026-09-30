// 選択肢と表示ラベル (DBのCHECK制約と一致させること)

export const RANK_BANDS = ['fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p'] as const;
export type RankBand = (typeof RANK_BANDS)[number];
export const RANK_LABELS: Record<RankBand, string> = {
  fc: 'F〜C',
  ba: 'B〜A',
  s1_3: 'S1〜S3',
  s4_6: 'S4〜S6',
  s7_9: 'S7〜S9',
  s10p: 'S10以上',
};

export const PLAY_ROLES = ['attacker', 'gunner', 'tank', 'sprinter'] as const;
export type PlayRole = (typeof PLAY_ROLES)[number];
export const PLAY_ROLE_LABELS: Record<PlayRole, string> = {
  attacker: 'アタッカー',
  gunner: 'ガンナー',
  tank: 'タンク',
  sprinter: 'スプリンター',
};

export const PURPOSES = ['tournament', 'rank', 'enjoy', 'custom'] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABELS: Record<Purpose, string> = {
  tournament: '大会',
  rank: 'ランク',
  enjoy: 'エンジョイ',
  custom: 'カスタム',
};

// 雰囲気タグ (性別による募集・絞り込みの代替)
export const MOOD_TAGS = ['beginner_welcome', 'relaxed', 'serious', 'considerate', 'quiet_ok', 'practice'] as const;
export type MoodTag = (typeof MOOD_TAGS)[number];
export const MOOD_TAG_LABELS: Record<MoodTag, string> = {
  beginner_welcome: '初心者歓迎',
  relaxed: 'まったり',
  serious: 'ガチ',
  considerate: '配慮してほしい',
  quiet_ok: '聞き専OK',
  practice: '練習したい',
};

export const PROFILE_VC = ['yes', 'listen', 'no'] as const;
export type ProfileVc = (typeof PROFILE_VC)[number];
export const PROFILE_VC_LABELS: Record<ProfileVc, string> = {
  yes: 'VC可',
  listen: '聞き専なら可',
  no: 'VC不可',
};

export const RECRUIT_VC = ['on', 'any', 'off'] as const;
export type RecruitVc = (typeof RECRUIT_VC)[number];
export const RECRUIT_VC_LABELS: Record<RecruitVc, string> = {
  on: 'VCあり',
  any: 'VCどちらでも',
  off: 'VCなし',
};

export const RECRUIT_STATUS_LABELS = {
  open: '募集中',
  full: '満員',
  ended: '終了',
  cancelled: '取り消し',
} as const;
export type RecruitStatus = keyof typeof RECRUIT_STATUS_LABELS;

export const DURATION_OPTIONS_MIN = [30, 60, 90, 120, 180, 240, 360] as const;

export const LIMITS = {
  displayName: 20,
  bio: 200,
  characterName: 20,
  maxCharacters: 3,
  title: 40,
  note: 200,
  message: 300,
  reportReason: 500,
  feedback: 1000,
  roomCode: 16,
  minCapacity: 2,
  maxCapacity: 6,
  maxDurationMin: 360,
  maxStartAheadDays: 7,
  startGraceMin: 30,
} as const;

// レート制限値 (実際の強制はDBのRPC内。値を変える場合は両方を変更する)
export const RATE_LIMITS = {
  recruitmentPerHour: 3,
  activeRecruitments: 3,
  joinRequestsPer10Min: 10,
  messageMinIntervalSec: 2,
  messagesPer30Sec: 5,
  reportsPerDay: 10,
  feedbackPerHour: 5,
} as const;

export const TERMS_VERSION = '2026-09-30';

export const NOTIFICATION_LABELS: Record<string, string> = {
  join_request: '参加申請が届きました',
  approved: '参加が承認されました',
  rejected: '参加申請が見送られました',
  removed: '募集の参加者から外されました',
  participant_cancelled: '参加者が参加を取り消しました',
  recruitment_cancelled: '参加予定の募集が取り消されました',
  new_message: 'チャットに新着メッセージがあります',
};
