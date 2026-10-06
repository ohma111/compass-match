import { Wordmark } from './Wordmark';

/**
 * サイトを開いた直後、サーバーの応答を待つ間の画面 (真ん中でくるくる回る)。
 * ルートのレイアウトの Suspense の代わりに出し、ページの準備ができたら入れ替わる。
 */
export function BootSplash() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-floor" role="status" aria-label="読み込み中">
      <span className="boot-spinner" aria-hidden />
      <Wordmark className="text-[20px] text-ink" />
    </div>
  );
}
