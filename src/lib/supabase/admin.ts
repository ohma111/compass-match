import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleKey, getSupabaseEnv } from '../env';

/**
 * service_role で動くサーバー専用クライアント (RLS を無視する)。
 * 使い道はユーザーID登録・引き継ぎコードだけに限定する:
 *   - auth.admin.createUser / updateUserById / deleteUser
 *   - service_role 専用の RPC (auth_rate_check / register_account / verify_recovery / set_recovery_hash)
 * それ以外のデータの読み書きは、利用者本人の権限で動く ./server.ts の createClient を使うこと。
 */
export function createAdminClient(): SupabaseClient {
  const { url } = getSupabaseEnv();
  const key = getServiceRoleKey();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** 取得したアクセストークンで、その利用者として RPC を呼ぶためのクライアント (cookie を使わない) */
export function createUserTokenClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = getSupabaseEnv();
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
