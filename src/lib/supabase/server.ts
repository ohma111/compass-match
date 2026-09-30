import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from '../env';

/** サーバーコンポーネント / Server Action / Route Handler 用 (ユーザー権限で動作、RLSが効く) */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // サーバーコンポーネントからは書き込めない。proxy.ts がセッションを更新する。
        }
      },
    },
  });
}
