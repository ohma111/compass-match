// 選択肢と表示ラベル (DBのCHECK制約と一致させること)

// v4.1: 4段階 (シーズン中もエンジョイ期間も同じ区切り)。旧コードは 20261003000008_v41.sql で移行済み
export const RANK_BANDS = ['fa', 's1_4', 's5_7', 's8p'] as const;
export type RankBand = (typeof RANK_BANDS)[number];
/** 表示は高い順 (左が高い)。DB の値の並び (低い順) とは逆 */
export const RANK_LABELS: Record<RankBand, string> = {
  fa: 'A–F',
  s1_4: 'S4–1',
  s5_7: 'S7–5',
  s8p: 'S8↑',
};
/** 選ぶ画面・表示の並び (高い順) */
export const RANK_BANDS_DESC: readonly RankBand[] = ['s8p', 's5_7', 's1_4', 'fa'];

/** 席の中など狭い所に出す短い表記 */
export const RANK_SHORT: Record<RankBand, string> = RANK_LABELS;

export const PLAY_ROLES = ['attacker', 'gunner', 'tank', 'sprinter'] as const;
export type PlayRole = (typeof PLAY_ROLES)[number];
export const PLAY_ROLE_LABELS: Record<PlayRole, string> = {
  attacker: 'アタッカー',
  gunner: 'ガンナー',
  tank: 'タンク',
  sprinter: 'スプリンター',
};

// 表示順 (チップの並び)。DBの値は変えない
export const PURPOSES = ['rank', 'enjoy', 'tournament', 'custom'] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABELS: Record<Purpose, string> = {
  rank: 'バトルアリーナ',
  enjoy: 'フリーバトル',
  tournament: '大会練習',
  custom: 'カスタム',
};

/** 仮のランク帯 (ユーザーID登録時)。初めての募集・参加のときに本人が1タップで選び直す */
export const DEFAULT_RANK_BAND: RankBand = 's1_4';

/** 募集条件「S4〜」のような短い下限表記 */
export const RANK_MIN_LABELS: Record<RankBand, string> = {
  fa: 'F↑',
  s1_4: 'S1↑',
  s5_7: 'S5↑',
  s8p: 'S8↑',
};

/** ゲームへの姿勢 (DB の値は win / fun) */
export const STANCES = ['win', 'fun'] as const;
export type Stance = (typeof STANCES)[number];
export const STANCE_LABELS: Record<Stance, string> = {
  win: '勝ちたい',
  fun: '楽しみたい',
};

// 参加方式: 早い者勝ち(即参加) / 承認制
export const JOIN_MODES = ['instant', 'approval'] as const;
export type JoinMode = (typeof JOIN_MODES)[number];
export const JOIN_MODE_LABELS: Record<JoinMode, string> = {
  instant: '早い者勝ち',
  approval: '承認制',
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

/** 終了時刻は入力させず、開始 + この時間で自動設定する */
export const DEFAULT_DURATION_MIN = 60;

export const LIMITS = {
  displayName: 20,
  bio: 100,
  characterName: 20,
  maxCharacters: 3,
  title: 40, // 「ひとこと」(タイトル)
  note: 200,
  message: 20,
  reportReason: 500,
  feedback: 1000,
  roomCode: 16,
  minCapacity: 2,
  maxCapacity: 6,
  maxPartyCapacity: 3, // カスタム以外は3人パーティまで
  maxStartAheadDays: 7,
  startGraceMin: 30,
} as const;

// レート制限値 (実際の強制はDBのRPC内。値を変える場合は両方を変更する)
export const RATE_LIMITS = {
  recruitmentPerHour: 3,
  activeRecruitments: 3,
  joinRequestsPer10Min: 10,
  messageMinIntervalSec: 3,
  messagesPerMinute: 8,
  reportsPerDay: 10,
  feedbackPerHour: 5,
} as const;

export const TERMS_VERSION = '2026-09-30';

export const NOTIFICATION_LABELS: Record<string, string> = {
  join_request: '参加申請が届きました',
  joined: 'あなたの募集に参加者が入りました',
  approved: '参加が承認されました',
  rejected: '参加申請が見送られました',
  removed: '募集の参加者から外されました',
  participant_cancelled: '参加者が参加を取り消しました',
  recruitment_cancelled: '参加予定の募集が取り消されました',
  new_message: 'チャットに新着メッセージがあります',
  followed_posted: '通知を受け取っている人が募集を出しました',
};
