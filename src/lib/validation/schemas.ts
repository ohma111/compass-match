import { z } from 'zod';
import {
  COLLAB_MAX,
  asksDeck,
  canDuo,
  isDeckLevel,
  DEFAULT_DURATION_MIN,
  DURATIONS,
  JOIN_MODES,
  LIMITS,
  MOOD_TAGS,
  PLAY_ROLES,
  PROFILE_VC,
  PURPOSES,
  RANK_BANDS,
  MIN_RANKS,
  RECRUIT_VC,
  STANCES,
} from '../constants';
import { LIST_SORTS } from '../list-filter';
import { containsUrl } from './url';
import { BANNED_MESSAGE, CONTACT_MESSAGE, containsBanned, containsContact } from '../moderation/banned';
import { sanitizeSrc } from '../src-param';
import { isValidCapacity } from '../capacity';
import { autoEnd, autoTitle, resolveStart, START_DAYS, START_KEYS } from '../recruit';
import {
  LOGIN_ID_PATTERN,
  LOGIN_ID_RULE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  isValidRecoveryCode,
  normalizeLoginId,
  normalizeRecoveryCode,
  passwordByteLength,
} from '../account';

const NO_URL = 'URLは使えません';

/** 前後の空白を除去し、URLを禁止した文字列 */
const safeText = (max: number, opts: { min?: number; label: string }) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(opts.min ?? 0, `${opts.label}を入力してください`)
        .max(max, `${opts.label}は${max}文字以内で入力してください`)
        .refine((s) => !containsUrl(s), NO_URL)
        .refine((s) => !containsBanned(s), BANNED_MESSAGE),
    );

/** 空文字は null にする任意入力 */
const optionalPattern = (re: RegExp, msg: string) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.union([z.literal(''), z.string().regex(re, msg)]))
    .transform((s) => (s === '' ? null : s));

const uniqueArray = <T extends string>(values: readonly [T, ...T[]], max?: number) =>
  z
    .array(z.enum(values))
    .max(max ?? values.length)
    .transform((a) => Array.from(new Set(a)));

export const profileSchema = z.object({
  displayName: safeText(LIMITS.displayName, { min: 1, label: '表示名' }),
  rankBand: z.union([z.literal(''), z.enum(RANK_BANDS)]).nullish().transform((v) => (v ? v : null)),
  playRoles: uniqueArray(PLAY_ROLES),
  characters: z
    .array(z.string())
    .transform((a) => a.map((s) => s.trim()).filter(Boolean))
    .pipe(
      z
        .array(
          z
            .string()
            .max(LIMITS.characterName, `キャラ名は${LIMITS.characterName}文字以内で入力してください`)
            .refine((s) => !containsUrl(s), NO_URL),
        )
        .max(LIMITS.maxCharacters, `よく使うキャラは${LIMITS.maxCharacters}人まで登録できます`),
    ),
  purposes: uniqueArray(PURPOSES),
  vc: z.enum(PROFILE_VC),
  tags: uniqueArray(MOOD_TAGS),
  bio: safeText(LIMITS.bio, { label: '自己紹介' }),
  contactDiscord: optionalPattern(/^[a-z0-9_.]{2,32}$/, 'Discordのユーザー名は、半角英小文字・数字・_ . の2〜32文字で入力してください'),
  contactX: optionalPattern(/^@?[A-Za-z0-9_]{1,15}$/, 'XのIDは、半角英数字と _ の15文字以内で入力してください').transform((s) =>
    s ? s.replace(/^@/, '') : s,
  ),
  contactIngame: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.string().max(20, 'ゲーム内IDは20文字以内で入力してください').refine((s) => !containsUrl(s), NO_URL))
    .transform((s) => (s === '' ? null : s)),
  agreeTerms: z.boolean(),
  src: z.unknown().transform(sanitizeSrc),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

/** 初回登録(1画面)。その他の項目はマイページで後から追加する */
export const onboardingSchema = z.object({
  displayName: safeText(LIMITS.displayName, { min: 1, label: '表示名' }),
  rankBand: z.union([z.literal(''), z.enum(RANK_BANDS)]).nullish().transform((v) => (v ? v : null)),
  playRoles: uniqueArray(PLAY_ROLES),
  agreeTerms: z.literal(true, { message: '利用規約とプライバシーポリシーへの同意が必要です' }),
  src: z.unknown().transform(sanitizeSrc),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

// ---------------------------------------------------------------------
// v3: ユーザーID + パスワード
// ---------------------------------------------------------------------
export const loginIdSchema = z
  .string({ message: 'ユーザーIDを入力してください' })
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'ユーザーIDを入力してください').regex(LOGIN_ID_PATTERN, `ユーザーIDは${LOGIN_ID_RULE}です`))
  .transform(normalizeLoginId);

export const passwordSchema = z
  .string({ message: 'パスワードを入力してください' })
  .min(PASSWORD_MIN, `パスワードは${PASSWORD_MIN}文字以上にしてください`)
  .refine((s) => passwordByteLength(s) <= PASSWORD_MAX_BYTES, 'パスワードが長すぎます (半角72文字まで)')
  .refine((s) => s.trim() === s, 'パスワードの前後に空白は使えません');

export const rankBandSchema = z.enum(RANK_BANDS, { message: 'ランクを選んでください' });

export { DEFAULT_RANK_BAND } from '../constants';

/** パスワードを忘れたとき: ユーザーID + 引き継ぎコード + 新しいパスワード */
export const recoverSchema = z.object({
  loginId: loginIdSchema,
  code: z
    .string({ message: '引き継ぎコードを入力してください' })
    .transform(normalizeRecoveryCode)
    .refine(isValidRecoveryCode, '引き継ぎコードは16桁です (ハイフンは省略できます)'),
  password: passwordSchema,
});

/** 空欄は null。デキレは 120〜240 の10刻み、コラボ数は1〜9999 (それ以外も null にして、必須の判定で弾く) */
const optDeck = z.unknown().optional().transform((v) => {
  const n = Number(v);
  return v !== '' && v != null && isDeckLevel(n) ? n : null;
});
const optCollab = z.unknown().optional().transform((v) => {
  const n = Number(typeof v === 'string' ? v.normalize('NFKC') : v);
  return v !== '' && v != null && Number.isInteger(n) && n >= 1 && n <= COLLAB_MAX ? n : null;
});

/** 募集作成(タップ式)の入力。開始時刻はチップのキーで受け取り、サーバーの現在時刻で解決する */
export const recruitmentSchema = z
  .object({
    purpose: z.enum(PURPOSES, { message: '目的を選んでください' }),
    startKey: z.enum(START_KEYS, { message: '開始時刻を選んでください' }),
    startDay: z.enum(START_DAYS).catch('today'),
    startTime: z.string().max(5).optional(),
    stance: z.enum(STANCES, { message: '遊び方を選んでください' }),
    capacity: z.coerce.number().int(),
    joinMode: z.enum(JOIN_MODES, { message: '参加方式を選んでください' }),
    minRank: z
      .union([z.literal(''), z.enum(MIN_RANKS)])
      .optional()
      .transform((v) => (v ? v : null)),
    vc: z.enum(RECRUIT_VC).catch('any'),
    duration: z.coerce
      .number()
      .refine((n) => (DURATIONS as readonly number[]).includes(n))
      .catch(DEFAULT_DURATION_MIN),
    tags: uniqueArray(MOOD_TAGS),
    title: safeText(LIMITS.title, { label: 'ひとこと' }),
    src: z.unknown().transform(sanitizeSrc),
    duoOk: z.unknown().optional().transform((v) => v === 'on' || v === true),
    wantedRoles: uniqueArray(PLAY_ROLES).catch([]),
    ownerDeck: optDeck,
    ownerCollab: optCollab,
    minDeck: optDeck,
    minCollab: optCollab,
  })
  .superRefine((v, ctx) => {
    if (!isValidCapacity(v.purpose, v.capacity)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: v.purpose === 'custom' ? '人数は「あと1〜5人」から選んでください' : '人数は「あと1人」か「あと2人」から選んでください',
      });
    }
  });
export type RecruitmentInput = z.input<typeof recruitmentSchema>;

export interface RecruitmentData extends Omit<z.output<typeof recruitmentSchema>, 'startKey' | 'startDay' | 'startTime' | 'duration'> {
  startsAt: Date;
  endsAt: Date;
}

/**
 * 入力の検証 + 開始/終了時刻の解決 + タイトル自動生成。
 * now を注入できるのでテスト可能。
 */
export function buildRecruitment(
  input: unknown,
  now: Date = new Date(),
): { ok: true; data: RecruitmentData } | { ok: false; error: string } {
  const parsed = recruitmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { startKey, startDay, startTime, duration, ...v } = parsed.data;
  const startsAt = resolveStart(startKey, startDay, startTime, now);
  if (!startsAt) {
    return { ok: false, error: startTime ? 'その時刻はすでに過ぎています。開始時刻を選び直してください' : '開始時刻を選んでください' };
  }
  const windowError = validateStartWindow(startsAt, now);
  if (windowError) return { ok: false, error: windowError };
  const title = v.title || autoTitle({ purpose: v.purpose, minRank: v.minRank, capacity: v.capacity });
  // デキレ・コラボ数はバトルアリーナの承認制だけ (そのときは自分の値が必須)。2固定はバトルアリーナ・フリーバトルの3人募集だけ
  const deck = asksDeck(v.purpose, v.joinMode);
  if (deck && (v.ownerDeck === null || v.ownerCollab === null)) return { ok: false, error: 'あなたのデキレとコラボ数を入力してください' };
  const extra = {
    duoOk: v.duoOk && canDuo(v.purpose, v.capacity),
    ownerDeck: deck ? v.ownerDeck : null,
    ownerCollab: deck ? v.ownerCollab : null,
    minDeck: deck ? v.minDeck : null,
    minCollab: deck ? v.minCollab : null,
  };
  return { ok: true, data: { ...v, ...extra, title, startsAt, endsAt: autoEnd(startsAt, duration) } };
}

/** 作成時の開始日時チェック (now を注入できるよう分離) */
export function validateStartWindow(startsAt: Date, now: Date = new Date()): string | null {
  const t = startsAt.getTime();
  if (t < now.getTime() - LIMITS.startGraceMin * 60_000) return '開始日時が過去になっています';
  if (t > now.getTime() + LIMITS.maxStartAheadDays * 24 * 3600_000)
    return `開始日時は${LIMITS.maxStartAheadDays}日以内にしてください`;
  return null;
}

export const messageSchema = z.object({
  recruitmentId: z.uuid(),
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'メッセージを入力してください')
        .max(LIMITS.message, `メッセージは${LIMITS.message}文字以内で入力してください`)
        .refine((s) => !containsUrl(s), 'URLは送信できません')
        .refine((s) => !containsBanned(s), BANNED_MESSAGE)
        .refine((s) => !containsContact(s), CONTACT_MESSAGE)
        .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s), '使用できない文字が含まれています'),
    ),
});

export const reportSchema = z.object({
  targetType: z.enum(['user', 'recruitment', 'message']),
  targetId: z.uuid(),
  reason: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, '通報理由を入力してください')
        .max(LIMITS.reportReason, `通報理由は${LIMITS.reportReason}文字以内で入力してください`),
    ),
});

export const feedbackSchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'フィードバックを入力してください')
        .max(LIMITS.feedback, `フィードバックは${LIMITS.feedback}文字以内で入力してください`),
    ),
  page: z
    .string()
    .max(200)
    .optional()
    .transform((s) => (s && s.startsWith('/') ? s : null)),
});

export const uuidSchema = z.uuid();
export const decisionSchema = z.object({
  participationId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
});
export const adminUserActionSchema = z.object({
  userId: z.uuid(),
  action: z.enum(['ban', 'restore']),
});
export const adminResolveSchema = z.object({
  targetType: z.enum(['user', 'recruitment', 'message']),
  targetId: z.uuid(),
  unhide: z.boolean(),
});

const flag = z
  .unknown()
  .optional()
  .transform((v) => v === '1');

export const listFilterSchema = z.object({
  purpose: z.union([z.enum(PURPOSES), z.literal('all')]).catch('all'),
  soon: flag,
  /** 空きのある募集だけ (満員を出さない) */
  open: flag,
  /** 自分のランクで参加できる募集だけ */
  eligible: flag,
  vc: z.enum(RECRUIT_VC).optional().catch(undefined),
  stance: z.enum(STANCES).optional().catch(undefined),
  sort: z.enum(LIST_SORTS).catch('start'),
});
export type ListQuery = z.output<typeof listFilterSchema>;

/** zodのエラーを最初の1件の日本語メッセージにまとめる */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? '入力内容を確認してください';
}
