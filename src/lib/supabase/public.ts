import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../env';

/**
 * 未ログインと同じ見え方で読むクライアント (Cookie を使わない)。
 * 全員で共有してよいデータ (公開の募集一覧・メンテナンスの状態) を、unstable_cache で数秒まとめて使うときに使う。
 */
let client: SupabaseClient | null = null;
export function createPublicClient(): SupabaseClient {
  if (client) return client;
  const { url, anonKey } = getSupabaseEnv();
  client = createSupabaseClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}
