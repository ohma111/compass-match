import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';
import { isSupabaseConfigured } from './env';
import { PROFILE_SELECT } from './profile-columns';

export interface Viewer {
  userId: string;
  profile: Profile | null;
  isAdmin: boolean;
}

/** プロフィール取得の失敗。「プロフィールなし」とは区別する (初回登録へ戻さない) */
export class ProfileLoadError extends Error {
  constructor() {
    super('プロフィールを読み込めませんでした。再読み込みしてください');
    this.name = 'ProfileLoadError';
  }
}

/** JWT の中身のうち画面で使うもの */
export interface SessionClaims {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
}

/**
 * セッションの JWT を手元で検証して中身を返す (未ログインなら null)。
 * 署名鍵が非対称 (ES256) なので Supabase Auth への通信は不要 (公開鍵は10分キャッシュ)。
 * 1リクエスト内では cache() で1回だけ実行する (レイアウトとページで共有)。
 * 書き込み (Server Action) では引き続き getUser() でサーバーに確認する。
 */
export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims as { sub?: string; email?: string; is_anonymous?: boolean } | undefined;
  if (!c?.sub) return null;
  return { userId: c.sub, email: c.email || null, isAnonymous: Boolean(c.is_anonymous) };
});

/**
 * ログイン中のユーザーを取得 (未ログインならnull)。
 * プロフィールの取得でエラーが出た場合は例外を投げる。エラーを「プロフィールなし」と扱うと、
 * 登録済みの人が初回登録画面に戻されてしまう (v2 の不具合)。
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const supabase = await createClient();
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).eq('id', claims.userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', claims.userId),
  ]);
  if (profileRes.error) throw new ProfileLoadError();
  return {
    userId: claims.userId,
    profile: (profileRes.data as unknown as Profile | null) ?? null,
    isAdmin: (rolesRes.data ?? []).some((r: { role: string }) => r.role === 'admin'),
  };
});

/** ログイン必須のページ用。未ログインなら登録/ログインへ、プロフィール未作成(Discordで初めて入った人)なら初回登録へ */
export async function requireViewer(next: string, opts: { allowNoProfile?: boolean } = {}): Promise<Viewer> {
  // 未設定時はログイン画面へ (ログイン画面に設定不足の案内が出る)
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!viewer.profile && !opts.allowNoProfile) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return viewer;
}

export function isRestricted(p: Profile | null): boolean {
  return Boolean(p && (p.banned_at || p.suspended_at || p.hidden_at));
}

/** 画面の出し分け用: 未ログイン / 初回登録前 / 利用停止中 / 利用可能 */
/** 画面の出し分け用: 未ログイン / プロフィール未作成 / 利用停止中 / 利用可能 */
export function authStateOf(viewer: Viewer | null): 'guest' | 'no-profile' | 'restricted' | 'ready' {
  if (!viewer) return 'guest';
  if (!viewer.profile) return 'no-profile';
  if (isRestricted(viewer.profile)) return 'restricted';
  return 'ready';
}
