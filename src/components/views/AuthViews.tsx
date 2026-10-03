import Link from 'next/link';
import { signInWithProvider } from '@/app/auth/actions';
import { LoginForm } from '@/components/LoginForm';
import { RecoverForm } from '@/components/RecoverForm';
import { TransferRedeem } from '@/components/TransferForms';
import { Lineup } from '@/components/Lineup';

function DiscordOption({ next, configured }: { next: string; configured: boolean }) {
  return (
    <form action={signInWithProvider} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
      <input type="hidden" name="next" value={next} />
      <button
        name="provider"
        value="discord"
        className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4 disabled:opacity-50"
        disabled={!configured}
      >
        Discordでログイン
      </button>
    </form>
  );
}

/** 右側の「席」の絵 (PC のみ) */
function LobbyAside() {
  return (
    <aside className="sheet hidden items-center p-12 lg:flex" aria-hidden>
      <div className="-mx-2">
        <Lineup
          seats={[{ kind: 'owner', name: '募集者' }, { kind: 'member', name: 'あなた', you: true }, { kind: 'empty' }]}
          size="lg"
          label="募集者とあなたの席、空いている1つの席"
        />
      </div>
    </aside>
  );
}

/** v4「引き継ぐ」: 別の端末で作ったコードを入れる */
export function TransferView({ configured, hasProfileHere }: { configured: boolean; hasProfileHere: boolean }) {
  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-stretch lg:gap-16">
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:py-6">
        <h1 className="font-display text-[26px] leading-tight lg:text-[40px]">引き継ぐ</h1>
        {!configured && <p className="alert-error mt-4">設定待ちのため使えません</p>}
        <div className="mt-6">
          <TransferRedeem configured={configured} hasProfileHere={hasProfileHere} />
        </div>
        <p className="mt-6 border-t border-line pt-4 text-sm">
          <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">以前の方法でログイン</Link>
        </p>
      </div>
      <LobbyAside />
    </div>
  );
}

/** 以前の方法でログイン: v3 のユーザーID + パスワードと、Discord (管理者用) */
export function LoginView({ next, configured, resuming }: { next: string; configured: boolean; resuming: boolean }) {
  const q = `next=${encodeURIComponent(next)}`;
  void resuming;
  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-stretch lg:gap-16">
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:py-6">
        <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">以前の方法でログイン</h1>
        {!configured && <p className="alert-error mt-4">設定待ちのため使えません</p>}
        <div className="mt-6">
          <LoginForm next={next} configured={configured} />
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-x-4 text-sm">
          <Link href={`/login/recover?${q}`} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
            パスワードを忘れた
          </Link>
          <Link href="/transfer" className="inline-flex min-h-11 items-center font-bold text-ally underline underline-offset-4">
            引き継ぎコードで入る
          </Link>
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <DiscordOption next={next} configured={configured} />
        </div>
      </div>
      <LobbyAside />
    </div>
  );
}

export function RecoverView({ next, configured }: { next: string; configured: boolean }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">パスワードを忘れたとき</h1>
      <div className="mt-6">
        <RecoverForm next={next} configured={configured} />
      </div>
    </div>
  );
}
