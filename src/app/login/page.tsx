import Link from 'next/link';
import { signInWithProvider } from '../auth/actions';
import { safeNext } from '@/lib/safe-next';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata = { title: 'ログイン' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const configured = isSupabaseConfigured();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ログイン</h1>
      <p className="text-sm text-muted">
        DiscordまたはXのアカウントでログインできます。ログインしたことが相手や外部に通知されることはありません。
      </p>
      {!configured && <p className="alert-error">サーバーの設定が完了していないため、現在ログインできません。</p>}
      <form action={signInWithProvider} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <button name="provider" value="discord" className="btn w-full bg-[#5865F2] text-white" disabled={!configured}>
          Discordでログイン
        </button>
        <button name="provider" value="x" className="btn w-full bg-black text-white dark:bg-white dark:text-black" disabled={!configured}>
          X(Twitter)でログイン
        </button>
      </form>
      <p className="text-xs text-muted">
        ログインすると、<Link href="/terms" className="link">利用規約</Link>と
        <Link href="/privacy" className="link">プライバシーポリシー</Link>を確認のうえプロフィールを作成していただきます。13歳未満の方はご利用いただけません。
      </p>
    </div>
  );
}
