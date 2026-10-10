'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { dispatchPush } from '@/lib/push/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { toUserMessage } from '@/lib/db-error';
import { SRC_COOKIE, sanitizeSrc } from '@/lib/src-param';
import { AVATARS, COLLAB_MAX, TERMS_VERSION, isDeckLevel } from '@/lib/constants';
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
  rankBandSchema,
} from '@/lib/validation/schemas';

async function srcFromCookie(explicit?: unknown): Promise<string | null> {
  const direct = sanitizeSrc(explicit);
  if (direct) return direct;
  const store = await cookies();
  return sanitizeSrc(store.get(SRC_COOKIE)?.value);
}

/** この操作で作られた通知を、応答を返したあとにプッシュする */
function pushLater() {
  after(() => dispatchPush());
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
  if (lookupError) return fail('エラーが発生しました。もう一度お試しください');
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
  if (lookupError) return fail('エラーが発生しました。もう一度お試しください');
  if (!existing) return fail('先にプロフィールを作成してください');

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
  // マイページでランクを保存したら「選択済み」にする
  if (v.rankBand) await supabase.rpc('confirm_my_rank', { p_rank_band: v.rankBand });
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
    startDay: fd.get('startDay') ?? 'today',
    startTime: (fd.get('startTime') as string | null) ?? undefined,
    stance: fd.get('stance') ?? '',
    capacity: fd.get('capacity') ?? '',
    joinMode: fd.get('joinMode') ?? '',
    minRank: fd.get('minRank') ?? '',
    vc: fd.get('vc') ?? 'any',
    duration: fd.get('duration') ?? undefined,
    duoOk: fd.get('duoOk') ?? undefined,
    wantedRoles: formStrings(fd, 'wantedRoles'),
    ownerDeck: fd.get('ownerDeck') ?? undefined,
    ownerCollab: fd.get('ownerCollab') ?? undefined,
    minDeck: fd.get('minDeck') ?? undefined,
    minCollab: fd.get('minCollab') ?? undefined,
    tags: formStrings(fd, 'tags'),
    title: fd.get('title') ?? '',
    src: await srcFromCookie(fd.get('src')),
  });
  if (!built.ok) return fail(built.error);
  const v = built.data;

  const supabase = await createClient();
  // VC ありの募集は、Discord のユーザー名を連絡先に保存してから出す
  if (v.vc === 'on') {
    const saved = await saveDiscordAction(String(fd.get('discord') ?? ''));
    if (!saved.ok) return saved;
  }
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
    p_room_code: null,
    p_src: v.src,
    p_join_mode: v.joinMode,
    p_stance: v.stance,
    p_duo_ok: v.duoOk,
    p_wanted_roles: v.wantedRoles,
    p_owner_deck_level: v.ownerDeck,
    p_owner_collab: v.ownerCollab,
    p_min_deck_level: v.minDeck,
    p_min_collab: v.minCollab,
  });
  if (error) return fail(toUserMessage(error));
  pushLater();
  revalidatePath('/');
  redirect(`/recruitments/${data as string}?created=1`);
}

export async function cancelRecruitmentAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_recruitment', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  pushLater();
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return { ok: true, message: '募集を取り消しました' };
}

export async function setRoomCodeAction(recruitmentId: string, roomCode: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  const code = typeof roomCode === 'string' ? roomCode.normalize('NFKC').trim() : '';
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  if (code && !/^[0-9]{4}$/.test(code)) return fail('部屋番号は4桁の数字で入力してください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_room_code', { p_recruitment_id: id.data, p_room_code: code });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  return { ok: true, message: '部屋番号を更新しました' };
}

/** 募集者が募集の時間を延ばす (30分か1時間。開始から6時間まで) */
export async function extendRecruitmentAction(recruitmentId: string, minutes: number): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success || (minutes !== 30 && minutes !== 60)) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('extend_recruitment', { p_recruitment_id: id.data, p_minutes: minutes });
  if (error) return fail(toUserMessage(error));
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return { ok: true, message: minutes === 60 ? '1時間延長しました' : '30分延長しました' };
}

/** この募集のチャットの通知を止める / 戻す */
export async function setChatMuteAction(recruitmentId: string, muted: boolean): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_chat_mute', { p_recruitment_id: id.data, p_on: Boolean(muted) });
  if (error) return fail(toUserMessage(error));
  return { ok: true, message: muted ? 'この募集のチャットの通知を止めました' : 'この募集のチャットの通知を戻しました' };
}

// ---------------------------------------------------------------------
// 参加
// ---------------------------------------------------------------------
export async function requestJoinAction(
  recruitmentId: string,
  src?: string | null,
  deck?: { deck: number; collab: number } | null,
): Promise<ActionResult<{ joined: boolean }>> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  if (deck && (!isDeckLevel(deck.deck) || !Number.isInteger(deck.collab) || deck.collab < 1 || deck.collab > COLLAB_MAX)) {
    return fail('デキレとコラボ数を選び直してください');
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_join', {
    p_recruitment_id: id.data,
    p_src: await srcFromCookie(src),
    ...(deck ? { p_deck_level: deck.deck, p_collab: deck.collab } : {}),
  });
  if (error) return fail(toUserMessage(error));
  pushLater();
  const { data: row } = await supabase.from('participations').select('status').eq('id', data as string).maybeSingle();
  const joined = (row as { status: string } | null)?.status === 'approved';
  revalidatePath(`/recruitments/${id.data}`);
  revalidatePath('/');
  return {
    ok: true,
    data: { joined },
    message: joined ? '参加しました' : '参加を申請しました',
  };
}

export async function cancelParticipationAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_participation', { p_recruitment_id: id.data });
  if (error) return fail(toUserMessage(error));
  pushLater();
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
  if (!parsed.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_participation', {
    p_participation_id: parsed.data.participationId,
    p_decision: parsed.data.decision,
  });
  if (error) return fail(toUserMessage(error));
  pushLater();
  if (uuidSchema.safeParse(recruitmentId).success) revalidatePath(`/recruitments/${recruitmentId}`);
  return { ok: true, message: decision === 'approved' ? '承認しました' : '見送りました' };
}

// ---------------------------------------------------------------------
// チャット
// ---------------------------------------------------------------------
/** 送ったメッセージの id と本文を返す (Realtime がつながらなくても、自分の発言はすぐ画面に出す) */
export async function sendMessageAction(
  recruitmentId: string,
  body: string,
): Promise<ActionResult<{ id: string; body: string; created_at: string }>> {
  const parsed = messageSchema.safeParse({ recruitmentId, body });
  if (!parsed.success) return fail(firstError(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_message', {
    p_recruitment_id: parsed.data.recruitmentId,
    p_body: parsed.data.body,
  });
  if (error) return fail(toUserMessage(error));
  pushLater();
  return { ok: true, data: { id: data as string, body: parsed.data.body, created_at: new Date().toISOString() } };
}

// ---------------------------------------------------------------------
// ブロック・通報
// ---------------------------------------------------------------------
export async function blockUserAction(userId: string, block: boolean): Promise<ActionResult> {
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
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
  return { ok: true, message: '通報しました' };
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
  return { ok: true, message: '送信しました。ありがとうございます' };
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
  return { ok: true, message: on ? '「今から遊べる」に表示しました (3時間後に消えます)' : '表示をやめました' };
}

// ---------------------------------------------------------------------
// 管理者 (権限チェックはDB側 private.require_admin で強制)
// ---------------------------------------------------------------------
export async function adminUserAction(userId: string, action: 'ban' | 'restore'): Promise<ActionResult> {
  const parsed = adminUserActionSchema.safeParse({ userId, action });
  if (!parsed.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_user_state', {
    p_user: parsed.data.userId,
    p_action: parsed.data.action,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: parsed.data.action === 'restore' ? 'BANを解除しました' : 'BANしました' };
}

export async function adminDeleteRecruitmentAction(recruitmentId: string): Promise<ActionResult> {
  const id = uuidSchema.safeParse(recruitmentId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
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
  if (!parsed.success) return fail('操作できませんでした。ページを再読み込みしてください');
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
  // 引き継ぎコードの作成・引き継ぎも「使っている」として最終利用を更新する
  try {
    const supabase = await createClient();
    await supabase.rpc('touch_last_seen');
  } catch {
    // 記録できなくても続ける
  }
}

/** シートの「はじめる」: プロフィールを作る (セッションはブラウザの signInAnonymously で作成済み) */
export async function createProfileAction(input: {
  displayName: string;
  rankBand?: string | null;
  playRoles: string[];
  agreeTerms: boolean;
}): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse({
    displayName: input.displayName ?? '',
    rankBand: input.rankBand ?? null,
    playRoles: Array.isArray(input.playRoles) ? input.playRoles : [],
    agreeTerms: input.agreeTerms === true,
    src: await srcFromCookie(),
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('始められませんでした。ページを再読み込みして、もう一度お試しください');
  const { data: existing, error: lookupError } = await supabase.from('profiles').select('id').eq('id', auth.user.id).maybeSingle();
  if (lookupError) return fail('エラーが発生しました。もう一度お試しください');
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

// ---------------------------------------------------------------------
// v6: 通知を受け取る人 / プッシュ通知
// ---------------------------------------------------------------------
export async function setFollowAction(userId: string, on: boolean): Promise<ActionResult> {
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_follow', { p_target: id.data, p_on: Boolean(on) });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/me');
  revalidatePath(`/users/${id.data}`);
  return { ok: true, message: on ? 'この方が募集を出したらお知らせします' : '通知をオフにしました' };
}

export async function savePushSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }): Promise<ActionResult> {
  const ok =
    sub &&
    typeof sub.endpoint === 'string' &&
    /^https:\/\//.test(sub.endpoint) &&
    sub.endpoint.length <= 1000 &&
    typeof sub.p256dh === 'string' &&
    sub.p256dh.length <= 200 &&
    typeof sub.auth === 'string' &&
    sub.auth.length <= 100;
  if (!ok) return fail('通知を登録できませんでした');
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
  if (error) return fail(toUserMessage(error));
  return { ok: true, message: '通知をオンにしました' };
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return fail('操作できませんでした。ページを再読み込みしてください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint });
  if (error) return fail(toUserMessage(error));
  return { ok: true, message: '通知をオフにしました' };
}

export async function confirmRankAction(rank: string): Promise<ActionResult> {
  const v = rankBandSchema.safeParse(rank);
  if (!v.success) return fail('ランクを選んでください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('confirm_my_rank', { p_rank_band: v.data });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true, message: 'ランクを保存しました' };
}

/** 通知を消す (id がなければ自分の通知をすべて) */
export async function deleteNotificationsAction(id?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail('ログインが必要です');
  let q = supabase.from('notifications').delete().eq('user_id', data.user.id);
  if (id) {
    const v = uuidSchema.safeParse(id);
    if (!v.success) return fail('操作できませんでした');
    q = q.eq('id', v.data);
  }
  const { error } = await q;
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true, message: id ? '通知を削除しました' : 'すべての通知を削除しました' };
}

// ---------------------------------------------------------------------
// v8: 管理者のデータ削除 (権限は DB の private.require_admin で確かめる)
// ---------------------------------------------------------------------
export async function adminDeleteReportsAction(targetType: string | null, targetId: string | null, resolvedOnly: boolean): Promise<ActionResult> {
  if (targetId && !uuidSchema.safeParse(targetId).success) return fail('操作できませんでした');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_delete_reports', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_resolved_only: resolvedOnly,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: `通報を${data ?? 0}件削除しました` };
}

export async function adminDeleteFeedbackAction(id: string | null): Promise<ActionResult> {
  if (id && !uuidSchema.safeParse(id).success) return fail('操作できませんでした');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_delete_feedback', { p_ids: id ? [id] : null });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: `フィードバックを${data ?? 0}件削除しました` };
}

export async function adminDeleteInactiveUsersAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_delete_inactive_users');
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: `${data ?? 0}件のアカウントを削除しました` };
}

export async function adminRunCleanupAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_run_cleanup');
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: '古いデータを削除しました' };
}

export async function adminDeleteUserAction(userId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(userId).success) return fail('操作できませんでした');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_delete_user', { p_user: userId });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: 'アカウントを削除しました' };
}

/** 管理画面のユーザー一覧で選んだ人をまとめて BAN / 削除する。守られているアカウント・管理者は DB 側で拒否され、件数に入らない */
export async function adminBulkUsersAction(userIds: string[], op: 'ban' | 'delete'): Promise<ActionResult> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds)] : [];
  if (ids.length === 0 || ids.length > 50 || !ids.every((id) => uuidSchema.safeParse(id).success) || (op !== 'ban' && op !== 'delete')) {
    return fail('操作できませんでした。ページを再読み込みしてください');
  }
  const supabase = await createClient();
  let done = 0;
  let firstError: string | null = null;
  for (const id of ids) {
    const { error } =
      op === 'delete'
        ? await supabase.rpc('admin_delete_user', { p_user: id })
        : await supabase.rpc('admin_set_user_state', { p_user: id, p_action: 'ban' });
    if (error) firstError ??= toUserMessage(error);
    else done++;
  }
  revalidatePath('/admin');
  const verb = op === 'delete' ? '削除しました' : 'BANしました';
  if (done === 0) return fail(firstError ?? '操作できませんでした');
  const skipped = ids.length - done;
  return { ok: true, message: skipped > 0 ? `${done}人を${verb} (${skipped}人はできませんでした: ${firstError})` : `${done}人を${verb}` };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function adminDeleteRecruitmentLogsAction(from: string, to: string, withStats: boolean): Promise<ActionResult> {
  if (!DAY.test(from) || !DAY.test(to)) return fail('期間を選び直してください');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_delete_recruitment_logs', { p_from: from, p_to: to, p_with_stats: withStats });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/admin');
  return { ok: true, message: `募集を${data ?? 0}件削除しました` };
}

/** 管理画面の日時入力 (日本時間の「YYYY-MM-DDTHH:mm」) を ISO に */
function jstInput(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function adminSetMaintenanceAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const startsAt = jstInput(form.get('startsAt'));
  const endsAt = jstInput(form.get('endsAt'));
  if (Boolean(startsAt) !== Boolean(endsAt)) return fail('予定は開始と終了の両方を入力してください');
  const message = String(form.get('message') ?? '').slice(0, 200);
  const { error } = await supabase.rpc('admin_set_maintenance', {
    p_manual_on: form.get('manualOn') === 'on',
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_message: message,
  });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true, message: '保存しました' };
}

export async function adminAnnounceAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const body = String(form.get('body') ?? '').trim();
  if (!body || body.length > 300) return fail('お知らせは1〜300文字で入力してください');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_announce', { p_body: body });
  if (error) return fail(toUserMessage(error));
  // 人数が多いと1回で送り切れないので、残りがなくなるまで続ける
  after(async () => {
    for (let i = 0; i < 50; i++) {
      if ((await dispatchPush()) === 0) break;
    }
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: `${data ?? 0}人に配信しました` };
}

/** プロフィールのアイコンを変える (null ならロールか模様に戻す) */
export async function setAvatarAction(avatar: string | null): Promise<ActionResult> {
  if (avatar !== null && !(AVATARS as readonly string[]).includes(avatar)) return fail('アイコンを選び直してください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_my_avatar', { p_avatar: avatar });
  if (error) return fail(toUserMessage(error));
  revalidatePath('/', 'layout');
  return { ok: true, message: 'アイコンを変えました' };
}

/** VC ありの募集のために、Discord のユーザー名だけを保存する */
export async function saveDiscordAction(name: string): Promise<ActionResult> {
  const v = typeof name === 'string' ? name.normalize('NFKC').trim().replace(/^@/, '').toLowerCase() : '';
  if (!/^[a-z0-9_.]{2,32}$/.test(v)) return fail('Discordのユーザー名は、半角英小文字・数字・_ . の2〜32文字で入力してください');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_my_discord', { p_discord: v });
  if (error) return fail(toUserMessage(error));
  return { ok: true };
}

/** 管理画面: 今のデータベースの容量 (1分ごとに読み直す) */
export async function adminDbSizeAction(): Promise<ActionResult<{ db_bytes: number; at: string; compact_scheduled: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_db_size');
  if (error || !data) return fail(toUserMessage(error));
  return { ok: true, data: data as { db_bytes: number; at: string; compact_scheduled: boolean } };
}
