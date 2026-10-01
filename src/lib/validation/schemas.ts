import { z } from 'zod';
import {
  JOIN_MODES,
  LIMITS,
  MOOD_TAGS,
  PLAY_ROLES,
  PROFILE_VC,
  PURPOSES,
  RANK_BANDS,
  RECRUIT_VC,
} from '../constants';
import { containsUrl } from './url';
import { sanitizeSrc } from '../src-param';
import { isValidCapacity } from '../capacity';
import { autoEnd, autoTitle, resolveStart, START_KEYS } from '../recruit';
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

const NO_URL = 'URLは入力できません';

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
        .refine((s) => !containsUrl(s), NO_URL),
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
  rankBand: z.enum(RANK_BANDS, { message: 'ランク帯を選んでください' }),
  playRoles: uniqueArray(PLAY_ROLES),
  characters: z
    .array(z.string())
    .transform((a) => a.map((s) => s.trim()).filter(Boolean))
    .pipe(
      z
        .array(
          z
            .string()
            .max(LIMITS.characterName, `キャラ名は${LIMITS.characterName}文字以内です`)
            .refine((s) => !containsUrl(s), NO_URL),
        )
        .max(LIMITS.maxCharacters, `よく使うキャラは${LIMITS.maxCharacters}人までです`),
    ),
  purposes: uniqueArray(PURPOSES),
  vc: z.enum(PROFILE_VC),
  tags: uniqueArray(MOOD_TAGS),
  bio: safeText(LIMITS.bio, { label: '自己紹介' }),
  contactDiscord: optionalPattern(/^[a-z0-9_.]{2,32}$/, 'DiscordのユーザーIDは半角英小文字・数字・_ . の2〜32文字です'),
  contactX: optionalPattern(/^@?[A-Za-z0-9_]{1,15}$/, 'XのIDは半角英数字と_の15文字以内です').transform((s) =>
    s ? s.replace(/^@/, '') : s,
  ),
  contactIngame: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.string().max(20, 'ゲーム内IDは20文字以内です').refine((s) => !containsUrl(s), NO_URL))
    .transform((s) => (s === '' ? null : s)),
  agreeTerms: z.boolean(),
  src: z.unknown().transform(sanitizeSrc),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

/** 初回登録(1画面)。その他の項目はマイページで後から追加する */
export const onboardingSchema = z.object({
  displayName: safeText(LIMITS.displayName, { min: 1, label: '表示名' }),
  rankBand: z.enum(RANK_BANDS, { message: 'ランク帯を選んでください' }),
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

export const rankBandSchema = z.enum(RANK_BANDS, { message: 'ランク帯を選んでください' });

export { DEFAULT_RANK_BAND } from '../constants';

/**
 * 登録(1画面): ユーザーID・パスワード・同意だけ。
 * 表示名はユーザーIDで始め (あとから変えられる)、ランク帯は初めての募集・参加のときに聞く。
 */
export const signupSchema = z.object({
  loginId: loginIdSchema,
  password: passwordSchema,
  agreeTerms: z.literal(true, { message: '利用規約とプライバシーポリシーへの同意が必要です' }),
  src: z.unknown().transform(sanitizeSrc),
});
export type SignupInput = z.input<typeof signupSchema>;

/** パスワードを忘れたとき: ユーザーID + 引き継ぎコード + 新しいパスワード */
export const recoverSchema = z.object({
  loginId: loginIdSchema,
  code: z
    .string({ message: '引き継ぎコードを入力してください' })
    .transform(normalizeRecoveryCode)
    .refine(isValidRecoveryCode, '引き継ぎコードは16桁です (ハイフンはあってもなくても大丈夫です)'),
  password: passwordSchema,
});

/** 募集作成(タップ式)の入力。開始時刻はチップのキーで受け取り、サーバーの現在時刻で解決する */
export const recruitmentSchema = z
  .object({
    purpose: z.enum(PURPOSES, { message: '目的を選んでください' }),
    startKey: z.enum(START_KEYS, { message: '開始時刻を選んでください' }),
    startTime: z.string().max(5).optional(),
    capacity: z.coerce.number().int(),
    joinMode: z.enum(JOIN_MODES, { message: '参加方式を選んでください' }),
    minRank: z
      .union([z.literal(''), z.enum(RANK_BANDS)])
      .optional()
      .transform((v) => (v ? v : null)),
    vc: z.enum(RECRUIT_VC).catch('any'),
    tags: uniqueArray(MOOD_TAGS),
    title: safeText(LIMITS.title, { label: 'ひとこと' }),
    roomCode: optionalPattern(/^[0-9A-Za-z-]{1,16}$/, '部屋番号は半角英数字16文字以内です'),
    src: z.unknown().transform(sanitizeSrc),
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

export interface RecruitmentData extends Omit<z.output<typeof recruitmentSchema>, 'startKey' | 'startTime'> {
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
  const { startKey, startTime, ...v } = parsed.data;
  const startsAt = resolveStart(startKey, startTime, now);
  if (!startsAt) {
    return {
      ok: false,
      error: startKey === 'custom' ? '開始時刻を選んでください' : 'その時刻はすでに過ぎています。開始時刻を選び直してください',
    };
  }
  const windowError = validateStartWindow(startsAt, now);
  if (windowError) return { ok: false, error: windowError };
  const title = v.title || autoTitle({ purpose: v.purpose, minRank: v.minRank, capacity: v.capacity });
  return { ok: true, data: { ...v, title, startsAt, endsAt: autoEnd(startsAt) } };
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
        .max(LIMITS.message, `メッセージは${LIMITS.message}文字以内です`)
        .refine((s) => !containsUrl(s), 'URLは送信できません')
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
        .max(LIMITS.reportReason, `通報理由は${LIMITS.reportReason}文字以内です`),
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
        .max(LIMITS.feedback, `フィードバックは${LIMITS.feedback}文字以内です`),
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
  action: z.enum(['suspend', 'ban', 'restore']),
});
export const adminResolveSchema = z.object({
  targetType: z.enum(['user', 'recruitment', 'message']),
  targetId: z.uuid(),
  unhide: z.boolean(),
});

export const listFilterSchema = z.object({
  purpose: z.union([z.enum(PURPOSES), z.literal('all')]).catch('all'),
  soon: z
    .unknown()
    .optional()
    .transform((v) => v === '1'),
});

/** zodのエラーを最初の1件の日本語メッセージにまとめる */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? '入力内容を確認してください';
}
