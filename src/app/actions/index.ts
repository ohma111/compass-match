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
import {
  adminResolveSchema,
  adminUserActionSchema,
  decisionSchema,
  feedbackSchema,
  firstError,
  messageSchema,
  profileSchema,
  recruitmentSchema,
  reportSchema,
  uuidSchema,
  validateStartWindow,
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
// プロフィール
// ---------------------------------------------------------------------
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
    agreeTerms: fd.get('agreeTerms') === 'on',
    src: await srcFromCookie(),
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;
  const isNew = fd.get('isNew') === '1';
  if (isNew && !v.agreeTerms) return fail('利用規約とプライバシーポリシーへの同意が必要です');

  const supabase = await createClient();
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
    p_agree_terms: v.agreeTerms,
    p_terms_version: TERMS_VERSION,
    p_src: v.src,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  const next = safeNext(fd.get('next') as string | null, '');
  if (next) redirect(next);
  return { ok: true, message: 'プロフィールを保存しました' };
}

// ---------------------------------------------------------------------
// 募集
// ---------------------------------------------------------------------
export async function createRecruitmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = recruitmentSchema.safeParse({
    title: fd.get('title') ?? '',
    purpose: fd.get('purpose') ?? '',
    startsAtLocal: fd.get('startsAtLocal') ?? '',
    durationMin: fd.get('durationMin') ?? '',
    capacity: fd.get('capacity') ?? '',
    minRank: fd.get('minRank') ?? '',
    vc: fd.get('vc') ?? '',
    tags: formStrings(fd, 'tags'),
    note: fd.get('note') ?? '',
    roomCode: fd.get('roomCode') ?? '',
    src: await srcFromCookie(fd.get('src')),
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;
  const windowError = validateStartWindow(v.startsAt);
  if (windowError) return fail(windowError);

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
    p_note: v.note,
    p_room_code: v.roomCode,
    p_src: v.src,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/');
  revalidatePath('/recruitments');
  redirect(`/recruitments/${data as string}?created=1`);
}

export async function cancelRecruitmentAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_recruitment', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  return { ok: true, message: '募集を取り消しました' };
}

export async function setRoomCodeAction(recruitmentId: string, roomCode: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  const code = roomCode.trim();
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
export async function requestJoinAction(recruitmentId: string, src?: string | null): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_join', {
    p_recruitment_id: id.data,
    p_src: await srcFromCookie(src),
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  return { ok: true, message: '参加申請を送りました。募集者の承認をお待ちください' };
}

export async function cancelParticipationAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('不正なリクエストです');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_participation', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
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
  return { ok: true, message: decision === 'approved' ? '承認しました' : '見送りました' };
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
