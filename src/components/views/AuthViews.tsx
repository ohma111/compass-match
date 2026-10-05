import { signInWithProvider } from '@/app/auth/actions';
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
        Discord でログイン
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
        <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[40px]">引き継ぐ</h1>
        {!configured && <p className="alert-error mt-4">サーバーの設定が完了していないため、現在は利用できません</p>}
        <div className="mt-6">
          <TransferRedeem configured={configured} hasProfileHere={hasProfileHere} />
        </div>
        <div className="mt-10 border-t-2 border-ink pt-4">
          <p className="text-[13px] font-bold text-slate">運営者用</p>
          <DiscordOption next="/me" configured={configured} />
        </div>
      </div>
      <LobbyAside />
    </div>
  );
}

