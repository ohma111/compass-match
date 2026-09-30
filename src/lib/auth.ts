import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';
import { isSupabaseConfigured } from './env';

export interface Viewer {
  userId: string;
  profile: Profile | null;
  isAdmin: boolean;
}

/** ログイン中のユーザーを取得 (未ログインならnull) */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ]);
  return {
    userId: user.id,
    profile: (profile as Profile | null) ?? null,
    isAdmin: (roles ?? []).some((r: { role: string }) => r.role === 'admin'),
  };
}

/** ログイン必須のページ用。プロフィール未作成なら作成画面へ */
export async function requireViewer(next: string, opts: { allowNoProfile?: boolean } = {}): Promise<Viewer> {
  // 未設定時はログイン画面へ (ログイン画面に設定不足の案内が出る)
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!viewer.profile && !opts.allowNoProfile) redirect(`/profile/edit?next=${encodeURIComponent(next)}`);
  return viewer;
}

export function isRestricted(p: Profile | null): boolean {
  return Boolean(p && (p.banned_at || p.suspended_at || p.hidden_at));
}

