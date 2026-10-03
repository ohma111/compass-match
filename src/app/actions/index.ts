'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { toUserMessage } from '@/lib/db-error';
import { SRC_COOKIE, sanitizeSrc } from '@/lib/src-param';
import { TERMS_VERSION } from '@/lib/constants';
import { safeNext } from '@/lib/safe-next';
import type { ActionResult } from '@/lib/types';
import { isAuthCookie, persistentCookieOptions } from '@/lib/auth-cookies';
import {
  adminResolveSchema,
  adminUserActionSchema,
  decisionSchema,
  feedbackSchema,
  firstError,
  messageSchema,
  onboardingSchema,
  profileSchema,
  buildRecruitment,
  reportSchema,
  uuidSchema,
} from '@/lib/validation/schemas';

async function srcFromCookie(explicit?: unknown): Promise<string | null> {
  const direct = sanitizeSrc(explicit);
  if (direct) return direct;
  const store = await cookies();
  return sanitizeSrc(store.get(SRC_COOKIE)?.value);
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function formStrings(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === 'string');
}

// ---------------------------------------------------------------------
// 初回登録 (1画面) / プロフィール編集
// ---------------------------------------------------------------------
export async function onboardAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse({
    displayName: fd.get('displayName') ?? '',
    rankBand: fd.get('rankBand') ?? '',
    playRoles: formStrings(fd, 'playRoles'),
    agreeTerms: fd.get('agreeTerms') === 'on',
    src: await srcFromCookie(),
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;
  const next = safeNext(fd.get('next') as string | null, '/');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('ログインが必要です');
  // 登録済みなら上書きしない (マイページの編集を使う)。取得エラーは「未登録」と扱わない
  const { data: existing, error: lookupError } = await supabase.from('profiles').select('id').eq('id', auth.user.id).maybeSingle();
  if (lookupError) return fail('プロフィールを確認できませんでした。時間をおいてもう一度お試しください');
  if (!existing) {
    const { error } = await supabase.rpc('save_my_profile', {
      p_display_name: v.displayName,
      p_rank_band: v.rankBand,
      p_play_roles: v.playRoles,
      p_characters: [],
      p_purposes: [],
      p_vc: 'listen',
      p_tags: [],
      p_bio: '',
      p_contact_discord: null,
      p_contact_x: null,
      p_contact_ingame: null,
      p_agree_terms: true,
      p_terms_version: TERMS_VERSION,
      p_src: v.src,
    });
    if (error) return fail(toUserMessage(error));
  }
  revalidatePath('/', 'layout');
  redirect(next);
}

export async function saveProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    displayName: fd.get('displayName') ?? '',
    rankBand: fd.get('rankBand') ?? '',
    playRoles: formStrings(fd, 'playRoles'),
    characters: formStrings(fd, 'characters'),
    purposes: formStrings(fd, 'purposes'),
    vc: fd.get('vc') ?? '',
    tags: formStrings(fd, 'tags'),
    bio: fd.get('bio') ?? '',
    contactDiscord: fd.get('contactDiscord') ?? '',
    contactX: fd.get('contactX') ?? '',
    contactIngame: fd.get('contactIngame') ?? '',
    agreeTerms: false,
    src: null,
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('ログインが必要です');
  const { data: existing, error: lookupError } = await supabase.from('profiles').select('id').eq('id', auth.user.id).maybeSingle();
  if (lookupError) return fail('プロフィールを確認できませんでした。時間をおいてもう一度お試しください');
  if (!existing) return fail('先に初回登録を完了してください');

  const { error } = await supabase.rpc('save_my_profile', {
    p_display_name: v.displayName,
    p_rank_band: v.rankBand,
    p_play_roles: v.playRoles,
    p_characters: v.characters,
    p_purposes: v.purposes,
    p_vc: v.vc,
    p_tags: v.tags,
    p_bio: v.bio,
    p_contact_discord: v.contactDiscord,
    p_contact_x: v.contactX,
    p_contact_ingame: v.contactIngame,
    p_agree_terms: false,
    p_terms_version: TERMS_VERSION,
    p_src: null,
  });
  if (error) return fail(toUserMessage(error));
  // マイページでランク帯を保存したら「選択済み」にする
  await supabase.rpc('confirm_my_rank', { p_rank_band: v.rankBand });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'プロフィールを保存しました' };
}

// ---------------------------------------------------------------------
// 募集
// ---------------------------------------------------------------------
export async function createRecruitmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const built = buildRecruitment({
    purpose: fd.get('purpose') ?? '',
    startKey: fd.get('startKey') ?? '',
    startTime: (fd.get('startTime') as string | null) ?? undefined,
    capacity: fd.get('capacity') ?? '',
    joinMode: fd.get('joinMode') ?? '',
    minRank: fd.get('minRank') ?? '',
    vc: fd.get('vc') ?? 'any',
    tags: formStrings(fd, 'tags'),
    title: fd.get('title') ?? '',
    roomCode: fd.get('roomCode') ?? '',
    src: await srcFromCookie(fd.get('src')),
  });
  if (!built.ok) return fail(built.error);
  const v = built.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_recruitment', {
    p_title: v.title,
    p_purpose: v.purpose,
    p_starts_at: v.startsAt.toISOString(),
    p_ends_at: v.endsAt.toISOString(),
    p_capacity: v.capacity,
    p_min_rank: v.minRank,
    p_vc: v.vc,
    p_tags: v.tags,
    p_note: '',
    p_room_code: v.roomCode,
    p_src: v.src,
    p_join_mode: v.joinMode,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/');
  redirect(`/recruitments/${data as string}?created=1`);
}

export async function cancelRecruitmentAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_recruitment', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return { ok: true, message: '募集を取り消しました' };
}

export async function setRoomCodeAction(recruitmentId: string, roomCode: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  const code = typeof roomCode === 'string' ? roomCode.trim() : '';
  if (!id.success) return fail('不正なリクエストです');
  if (code && !/^[0-9A-Za-z-]{1,16}$/.test(code)) return fail('部屋番号は半角英数字16文字以内です');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_room_code', { p_recruitment_id: id.data, p_room_code: code });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  return { ok: true, message: '部屋番号を更新しました' };
}

// ---------------------------------------------------------------------
// 参加
// ---------------------------------------------------------------------
export async function requestJoinAction(
  recruitmentId: string,
  src?: string | null,
): Promise<ActionResult<{ joined: boolean }>> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_join', {
    p_recruitment_id: id.data,
    p_src: await srcFromCookie(src),
  });
  if (error) return fail(toUserMessage(error));
  const { data: row } = await supabase.from('participations').select('status').eq('id', data as string).maybeSingle();
  const joined = (row as { status: string } | null)?.status === 'approved';
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return {
    ok: true,
    data: { joined },
    message: joined ? '参加しました! 部屋番号とチャットが使えます' : '参加を申請しました。募集者の承認をお待ちください',
  };
}

export async function cancelParticipationAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_participation', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return { ok: true, message: '参加を取り消しました' };
}

export async function decideParticipationAction(
  recruitmentId: string,
  participationId: string,
  decision: 'approved' | 'rejected',
): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse({ participationId, decision });
  if (!parsed.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_participation', {
    p_participation_id: parsed.data.participationId,
    p_decision: parsed.data.decision,
  });
  if (error) return fail(toUserMessage(error));
  if (uuidSchema.safeParse(recruitmentId).success) revalidatePath(`/recruitments/${recruitmentId}`);
  return { ok: true, message: decision === 'approved' ? '承認しました' : '更新しました' };
}

// ---------------------------------------------------------------------
// チャット
// ---------------------------------------------------------------------
export async function sendMessageAction(recruitmentId: string, body: string): Promise<ActionResult> {
  const parsed = messageSchema.safeParse({ recruitmentId, body });
  if (!parsed.success) return fail(firstError(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc('send_message', {
    p_recruitment_id: parsed.data.recruitmentId,
    p_body: parsed.data.body,
  });
  if (error) return fail(toUserMessage(error));
  return { ok: true };
}

// ---------------------------------------------------------------------
// ブロック・通報
// ---------------------------------------------------------------------
export async function blockUserAction(userId: string, block: boolean): Promise<ActionResult> {
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc(block ? 'block_user' : 'unblock_user', { p_target: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true, message: block ? 'ブロックしました' : 'ブロックを解除しました' };
}

export async function reportAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = reportSchema.safeParse({
    targetType: fd.get('targetType'),
    targetId: fd.get('targetId'),
    reason: fd.get('reason') ?? '',
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_report', {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(toUserMessage(error));
  return { ok: true, message: '通報を受け付けました。ご協力ありがとうございます' };
}

// ---------------------------------------------------------------------
// フィードバック
// ---------------------------------------------------------------------
export async function feedbackAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse({
    body: fd.get('body') ?? '',
    page: (fd.get('page') as string | null) ?? undefined,
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_feedback', {
    p_body: parsed.data.body,
    p_page: parsed.data.page,
  });
  if (error) return fail(toUserMessage(error));
  return { ok: true, message: 'フィードバックを送信しました。ありがとうございます!' };
}

// ---------------------------------------------------------------------
// 通知
// ---------------------------------------------------------------------
export async function markNotificationsReadAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail('ログインが必要です');
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', data.user.id)
    .is('read_at', null);
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------
// 今から遊べる (機能フラグ)
// ---------------------------------------------------------------------
export async function setAvailableNowAction(on: boolean): Promise<ActionResult> {
  const { features } = await import('@/lib/env');
  if (!features.availableNow) return fail('この機能は現在利用できません');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_available_now', { p_on: on });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/now');
  return { ok: true, message: on ? '「今から遊べる」を登録しました (3時間後に自動で消えます)' : '登録を解除しました' };
}

// ---------------------------------------------------------------------
// 管理者 (権限チェックはDB側 private.require_admin で強制)
// ---------------------------------------------------------------------
export async function adminUserAction(userId: string, action: 'suspend' | 'ban' | 'restore'): Promise<ActionResult> {
  const parsed = adminUserActionSchema.safeParse({ userId, action });
  if (!parsed.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_user_state', {
    p_user: parsed.data.userId,
    p_action: parsed.data.action,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: '更新しました' };
}

export async function adminDeleteRecruitmentAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_delete_recruitment', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: '募集を削除しました' };
}

export async function adminResolveAction(
  targetType: 'user' | 'recruitment' | 'message',
  targetId: string,
  unhide: boolean,
): Promise<ActionResult> {
  const parsed = adminResolveSchema.safeParse({ targetType, targetId, unhide });
  if (!parsed.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_resolve_target', {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_unhide: parsed.data.unhide,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: '処理しました' };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

// ---------------------------------------------------------------------
// v4: 登録なしで始める (匿名サインインのあと、シートからプロフィールを作る)
// ---------------------------------------------------------------------

/**
 * ブラウザで書かれたセッション cookie を、サーバーの Set-Cookie で書き直す (400日)。
 * Safari ITP はスクリプトが書いた cookie を7日で消すため (src/lib/auth-cookies.ts)。
 */
async function persistAuthCookies(): Promise<void> {
  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  for (const c of store.getAll()) {
    if (isAuthCookie(c.name) && c.value) store.set(c.name, c.value, persistentCookieOptions(secure));
  }
}

export async function persistSessionAction(): Promise<void> {
  await persistAuthCookies();
}

/** シートの「はじめる」: プロフィールを作る (セッションはブラウザの signInAnonymously で作成済み) */
export async function createProfileAction(input: {
  displayName: string;
  rankBand: string;
  playRoles: string[];
  agreeTerms: boolean;
}): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse({
    displayName: input.displayName ?? '',
    rankBand: input.rankBand ?? '',
    playRoles: Array.isArray(input.playRoles) ? input.playRoles : [],
    agreeTerms: input.agreeTerms === true,
    src: await srcFromCookie(),
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('セッションを作れませんでした。ページを読み込み直して、もう一度「はじめる」を押してください');
  const { data: existing, error: lookupError } = await supabase.from('profiles').select('id').eq('id', auth.user.id).maybeSingle();
  if (lookupError) return fail('うまくいきませんでした。少し待ってから、もう一度押してください');
  if (!existing) {
    const { error } = await supabase.rpc('save_my_profile', {
      p_display_name: v.displayName,
      p_rank_band: v.rankBand,
      p_play_roles: v.playRoles,
      p_characters: [],
      p_purposes: [],
      p_vc: 'listen',
      p_tags: [],
      p_bio: '',
      p_contact_discord: null,
      p_contact_x: null,
      p_contact_ingame: null,
      p_agree_terms: true,
      p_terms_version: TERMS_VERSION,
      p_src: v.src,
    });
    if (error) return fail(toUserMessage(error));
  }
  await persistAuthCookies();
  revalidatePath('/', 'layout');
  return { ok: true };
}
