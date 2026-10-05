import { redirect } from 'next/navigation';

// v8: ユーザーID・パスワードのログインはやめた。引き継ぎは引き継ぎコードだけ (管理者用の Discord ログインは引き継ぎ画面の下)
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  redirect(sp.error ? `/transfer?error=${encodeURIComponent(sp.error)}` : '/transfer');
}
