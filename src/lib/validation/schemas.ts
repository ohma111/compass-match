import { z } from 'zod';
import {
  LIMITS,
  MOOD_TAGS,
  PLAY_ROLES,
  PROFILE_VC,
  PURPOSES,
  RANK_BANDS,
  RECRUIT_VC,
  DURATION_OPTIONS_MIN,
} from '../constants';
import { containsUrl } from './url';
import { parseJstLocalInput } from '../time';
import { sanitizeSrc } from '../src-param';

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

export const recruitmentSchema = z
  .object({
    title: safeText(LIMITS.title, { min: 1, label: 'タイトル' }),
    purpose: z.enum(PURPOSES, { message: '目的を選んでください' }),
    startsAtLocal: z.string(),
    durationMin: z.coerce
      .number()
      .int()
      .refine((n) => (DURATION_OPTIONS_MIN as readonly number[]).includes(n), '終了予定を選んでください'),
    capacity: z.coerce
      .number()
      .int()
      .min(LIMITS.minCapacity, `募集人数は${LIMITS.minCapacity}〜${LIMITS.maxCapacity}人です`)
      .max(LIMITS.maxCapacity, `募集人数は${LIMITS.minCapacity}〜${LIMITS.maxCapacity}人です`),
    minRank: z
      .union([z.literal(''), z.enum(RANK_BANDS)])
      .optional()
      .transform((v) => (v ? v : null)),
    vc: z.enum(RECRUIT_VC),
    tags: uniqueArray(MOOD_TAGS),
    note: safeText(LIMITS.note, { label: 'メモ' }),
    roomCode: optionalPattern(/^[0-9A-Za-z-]{1,16}$/, '部屋番号は半角英数字16文字以内です'),
    src: z.unknown().transform(sanitizeSrc),
  })
  .transform((v, ctx) => {
    const startsAt = parseJstLocalInput(v.startsAtLocal);
    if (!startsAt) {
      ctx.addIssue({ code: 'custom', message: '開始日時を正しく入力してください', path: ['startsAtLocal'] });
      return z.NEVER;
    }
    const endsAt = new Date(startsAt.getTime() + v.durationMin * 60_000);
    return { ...v, startsAt, endsAt };
  });
export type RecruitmentData = z.output<typeof recruitmentSchema>;

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
  day: z.enum(['today', 'tomorrow', 'all']).catch('all'),
  purpose: z.union([z.enum(PURPOSES), z.literal('all')]).catch('all'),
});

/** zodのエラーを最初の1件の日本語メッセージにまとめる */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? '入力内容を確認してください';
}
