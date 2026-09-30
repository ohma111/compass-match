import Link from 'next/link';
import { signInWithProvider } from '../auth/actions';
import { safeNext } from '@/lib/safe-next';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata = { title: 'ログイン' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const configured = isSupabaseConfigured();
  const resuming = next.startsWith('/recruitments/');
  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">LOGIN</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-snug">
          {resuming ? 'ログインして続ける' : 'ログイン'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {resuming
            ? 'ログインすると、さっきの操作(参加・募集)にそのまま戻ります。'
            : 'DiscordまたはXのアカウントで、すぐにはじめられます。'}
          ログインしたことが相手や外部に通知されることはありません。
        </p>
      </div>
      {!configured && <p className="alert-error">サーバーの設定が完了していないため、現在ログインできません。</p>}
      <form action={signInWithProvider} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <button name="provider" value="discord" className="btn btn-lg w-full bg-[#5865F2] text-white" disabled={!configured}>
          Discordでログイン
        </button>
        <button name="provider" value="x" className="btn btn-lg w-full bg-white text-black" disabled={!configured}>
          Xでログイン
        </button>
      </form>
      <p className="text-xs leading-relaxed text-muted">
        はじめての方は、このあと表示名とランク帯を選ぶだけで登録完了です。
        <Link href="/terms" className="link">利用規約</Link>・<Link href="/privacy" className="link">プライバシーポリシー</Link>
        をご確認ください。13歳未満の方はご利用いただけません。
      </p>
    </div>
  );
}
