import Link from 'next/link';
import { signInWithProvider } from '@/app/auth/actions';
import { SignupForm } from '@/components/SignupForm';
import { LoginForm } from '@/components/LoginForm';
import { RecoverForm } from '@/components/RecoverForm';
import { Lineup } from '@/components/Lineup';

function DiscordOption({ next, configured }: { next: string; configured: boolean }) {
  return (
    <form action={signInWithProvider} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
      <input type="hidden" name="next" value={next} />
      <span>Discordで登録した方は</span>
      <button
        name="provider"
        value="discord"
        className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4 disabled:opacity-50"
        disabled={!configured}
      >
        Discordでも入れる
      </button>
    </form>
  );
}

/** 登録 (1画面) */
export function SignupView({
  next,
  configured,
  resuming,
  initialCode,
  initialLoginId,
}: {
  next: string;
  configured: boolean;
  resuming: boolean;
  initialCode?: string;
  initialLoginId?: string;
}) {
  if (initialCode) return <SignupForm next={next} configured={configured} initialCode={initialCode} initialLoginId={initialLoginId} />;
  return (
    <div>
      <div className="mb-7 max-w-xl lg:mb-10">
        <h1 className="font-display text-[26px] leading-tight lg:text-[40px]">{resuming ? '登録して続ける' : 'はじめる'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          ユーザーIDとパスワードを決めるだけ。メールアドレスはいりません。
          {resuming && '登録が終わると、さっきの操作にそのまま戻ります。'}
        </p>
        <p className="mt-3 text-sm">
          IDを持っている方は <Link href={`/login?next=${encodeURIComponent(next)}`} className="link">ログイン</Link>
        </p>
      </div>
      <SignupForm next={next} configured={configured} initialCode={initialCode} />
      <div className="mt-8 border-t border-line pt-4">
        <DiscordOption next={next} configured={configured} />
      </div>
    </div>
  );
}

/** ログイン: ユーザーIDとパスワードの2欄。PC では右に「席」の絵を置く */
export function LoginView({ next, configured, resuming }: { next: string; configured: boolean; resuming: boolean }) {
  const q = `next=${encodeURIComponent(next)}`;
  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-stretch lg:gap-16">
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:py-6">
        <h1 className="font-display text-[26px] leading-tight lg:text-[40px]">ログイン</h1>
        <p className="mt-2 text-sm text-slate">
          {resuming ? 'ログインすると、さっきの操作にそのまま戻ります。' : 'ユーザーIDとパスワードを入れてください。'}
        </p>
        {!configured && <p className="alert-error mt-4">サーバーの設定が完了していないため、現在ログインできません。</p>}
        <div className="mt-6">
          <LoginForm next={next} configured={configured} />
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-x-4 text-sm">
          <Link href={`/login/recover?${q}`} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
            パスワードを忘れた
          </Link>
          <Link href={`/signup?${q}`} className="inline-flex min-h-11 items-center font-bold text-ally underline underline-offset-4">
            はじめての方は登録
          </Link>
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <DiscordOption next={next} configured={configured} />
        </div>
      </div>
      <aside className="sheet hidden flex-col justify-between p-10 lg:flex" aria-label="このサイトでできること">
        <div className="-mx-2">
          <Lineup
            seats={[{ kind: 'owner', name: '募集者' }, { kind: 'member', name: 'あなた', you: true }, { kind: 'empty' }]}
            size="lg"
            label="募集者とあなたの席、空いている1つの席"
          />
        </div>
        <div className="mt-10">
          <p className="font-display text-[26px] leading-snug text-balance">空いている席に入れば、すぐ一緒に遊べます。</p>
          <p className="mt-3 text-sm leading-relaxed text-slate">部屋番号とチャットは、参加した人にだけ表示されます。</p>
        </div>
      </aside>
    </div>
  );
}

export function RecoverView({ next, configured }: { next: string; configured: boolean }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">パスワードを忘れたとき</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        登録したときに保存した引き継ぎコードで、新しいパスワードを決められます。
      </p>
      <div className="mt-6">
        <RecoverForm next={next} configured={configured} />
      </div>
    </div>
  );
}
