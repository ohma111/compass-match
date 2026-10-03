'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceRoleKey, isAccountServiceConfigured, siteUrl } from '@/lib/env';
import { safeNext } from '@/lib/safe-next';
import { authEmailFor } from '@/lib/account';
import { clientIp, generateRecoveryCode, hashRecoveryCode, rateKey } from '@/lib/account-server';
import { firstError, recoverSchema } from '@/lib/validation/schemas';
import type { ActionResult } from '@/lib/types';

// ---------------------------------------------------------------------
// Discord (既存の管理者アカウント用に残している副ログイン。X は v3 で画面から外した)
// ---------------------------------------------------------------------
const providerSchema = z.enum(['discord']);

export async function signInWithProvider(fd: FormData) {
  const provider = providerSchema.safeParse(fd.get('provider'));
  if (!provider.success) redirect('/login?error=provider');
  const next = safeNext(fd.get('next') as string | null);
  const h = await headers();
  const origin = h.get('origin') || siteUrl();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.data,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: 'identify',
    },
  });
  if (error || !data.url) redirect('/auth/error');
  redirect(data.url);
}

// ---------------------------------------------------------------------
// ユーザーID + パスワード
// ---------------------------------------------------------------------

/** 引き継ぎコードの試行: 接続元ごとに1時間10回、ユーザーIDごとに1時間5回まで */
const RECOVER_IP_LIMIT = { limit: 10, windowSec: 3600 };
const RECOVER_ID_LIMIT = { limit: 5, windowSec: 3600 };

const NOT_CONFIGURED = 'サーバーの設定が終わっていないため、今は使えません (運営者の設定待ちです)';
const TOO_MANY = '短い時間に何度も試されたため、いったん止めています。1時間ほど待ってからもう一度お試しください';

type Admin = ReturnType<typeof createAdminClient>;

async function underLimit(admin: Admin, kind: 'signup_ip' | 'recover_ip' | 'recover_id', key: string, limit: number, windowSec: number) {
  const { data, error } = await admin.rpc('auth_rate_check', {
    p_kind: kind,
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSec,
  });
  if (error) throw new Error('rate check failed');
  return data === true;
}

/** Supabase Auth のエラーを利用者向けの文に (内部情報は出さない) */
function authErrorMessage(err: { code?: string; status?: number; message?: string } | null): string {
  const code = err?.code ?? '';
  if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered/i.test(err?.message ?? ''))
    return 'このユーザーIDはすでに使われています。別のIDにしてください';
  if (code === 'weak_password') return 'パスワードが弱すぎます。もっと長く、推測されにくいものにしてください';
  if (err?.status === 429 || code === 'over_request_rate_limit') return TOO_MANY;
  return '登録できませんでした。時間をおいてもう一度お試しください';
}

export async function recoverAction(
  _prev: ActionResult<{ code: string; next: string }> | null,
  fd: FormData,
): Promise<ActionResult<{ code: string; next: string }>> {
  const parsed = recoverSchema.safeParse({
    loginId: fd.get('loginId') ?? '',
    code: fd.get('code') ?? '',
    password: fd.get('password') ?? '',
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const next = safeNext(fd.get('next') as string | null, '/');
  if (!isAccountServiceConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const secret = getServiceRoleKey()!;
  const admin = createAdminClient();
  try {
    const ipOk = await underLimit(admin, 'recover_ip', rateKey(secret, 'recover_ip', clientIp(await headers())), RECOVER_IP_LIMIT.limit, RECOVER_IP_LIMIT.windowSec);
    const idOk = ipOk && (await underLimit(admin, 'recover_id', rateKey(secret, 'recover_id', v.loginId), RECOVER_ID_LIMIT.limit, RECOVER_ID_LIMIT.windowSec));
    if (!ipOk || !idOk) return { ok: false, error: TOO_MANY };
  } catch {
    return { ok: false, error: '処理できませんでした。時間をおいてもう一度お試しください' };
  }

  const found = await admin.rpc('verify_recovery', { p_login_id: v.loginId, p_recovery_hash: hashRecoveryCode(v.code) });
  const userId = (found.data as string | null) ?? null;
  if (found.error || !userId) return { ok: false, error: 'ユーザーIDか引き継ぎコードが違います' };

  const upd = await admin.auth.admin.updateUserById(userId, { password: v.password });
  if (upd.error) return { ok: false, error: authErrorMessage(upd.error) };

  // 使った引き継ぎコードは無効にして、新しいコードを1回だけ表示する
  const code = generateRecoveryCode();
  await admin.rpc('set_recovery_hash', { p_user_id: userId, p_recovery_hash: hashRecoveryCode(code) });

  const supabase = await createClient();
  const signed = await supabase.auth.signInWithPassword({ email: authEmailFor(v.loginId), password: v.password });
  if (signed.error) return { ok: false, error: 'パスワードは変更しました。ログイン画面から入り直してください' };
  // ほかの端末に残っているログインは切る (乗っ取られていた場合に備える)
  await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
  revalidatePath('/', 'layout');
  return { ok: true, data: { code, next } };
}

/** マイページ: 引き継ぎコードを作り直す (古いコードは使えなくなる) */
export async function reissueRecoveryCodeAction(): Promise<ActionResult<{ code: string }>> {
  if (!isAccountServiceConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'ログインが必要です' };
  const admin = createAdminClient();
  const code = generateRecoveryCode();
  const res = await admin.rpc('set_recovery_hash', { p_user_id: data.user.id, p_recovery_hash: hashRecoveryCode(code) });
  if (res.error) return { ok: false, error: '作り直せませんでした。時間をおいてもう一度お試しください' };
  if (res.data !== true) return { ok: false, error: 'Discordで登録したアカウントには引き継ぎコードがありません' };
  return { ok: true, data: { code } };
}
