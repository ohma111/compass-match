import Link from 'next/link';
import { Bell, Plus } from 'lucide-react';
import { TabBar, type TabKey } from './TabBar';
import { LogoMark } from './LogoMark';

/**
 * 全画面共通の枠: インクのヘッダー (スマホはサイト名だけ、PCはメニューも) / 本文 / フッター / 下部タブバー (スマホ)
 * 開発用プレビュー (/dev/preview) からも同じものを使う。
 */
export function AppShell({
  children,
  unread,
  signedIn,
  restricted,
  configured,
  active,
}: {
  children: React.ReactNode;
  unread: number;
  signedIn: boolean;
  restricted: boolean;
  configured: boolean;
  /** タブの選択状態を URL ではなく明示的に指定する (プレビュー用) */
  active?: TabKey;
}) {
  const nav = 'inline-flex min-h-11 items-center px-3 text-sm font-bold text-white/85 hover:text-white';
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2">
        本文へ移動
      </a>
      <header className="sticky top-0 z-30 bg-ink pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-13 max-w-[1240px] items-center gap-4 px-4 lg:h-16 lg:px-8">
          <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3 whitespace-nowrap" aria-label="コンパス遊び相手さがし ホーム">
            <LogoMark />
            <span className="type-heavy truncate text-[16px] lg:text-[22px] lg:font-display lg:font-normal lg:tracking-normal">コンパス遊び相手さがし</span>
          </Link>
          <nav aria-label="メニュー" className="ml-auto hidden items-center gap-1 lg:flex">
            <Link href="/" className={nav}>募集一覧</Link>
            {signedIn ? (
              <>
                <Link href="/notifications" className={`${nav} gap-1.5`}>
                  <Bell className="size-4" aria-hidden />
                  通知
                  {unread > 0 && (
                    <span className="min-w-5 bg-signal px-1 text-center text-xs leading-5 font-bold text-white">
                      {unread > 99 ? '99+' : unread}
                      <span className="sr-only">件の未読</span>
                    </span>
                  )}
                </Link>
                <Link href="/me" className={nav}>マイページ</Link>
              </>
            ) : (
              <Link href="/login" className={nav}>ログイン</Link>
            )}
            <Link
              href="/recruitments/new"
              className="ml-3 inline-flex min-h-11 items-center gap-1.5 px-4 text-sm font-bold text-ink"
              style={{ background: 'linear-gradient(315deg, transparent 10px, #ffffff 0)' }}
            >
              <Plus className="size-4" strokeWidth={3} aria-hidden />
              募集する
            </Link>
          </nav>
          {!signedIn && (
            <Link href="/login" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold text-white/90 underline underline-offset-4 lg:hidden">
              ログイン
            </Link>
          )}
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.25rem)] flex-col lg:min-h-[calc(100dvh-4rem)]">
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-12 lg:px-8 lg:pt-12 lg:pb-16">
        {!configured && (
          <p className="alert-error mb-6">サーバーの設定(Supabase環境変数)が未完了です。README の手順に従って設定してください。</p>
        )}
        {restricted && (
          <p className="alert-error mb-6">
            このアカウントは現在、募集・参加・チャットを利用できません。心当たりがない場合はフィードバックからお問い合わせください。
          </p>
        )}
        {children}
      </main>

      {/* スマホは下の固定バー (タブバーか募集ボタン、どちらも64px) の分だけ余白を取る */}
      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] text-xs text-slate lg:px-8 lg:pb-12">
        <div className="border-t-2 border-ink pt-4">
          <nav className="flex flex-wrap gap-x-5" aria-label="サイト情報">
            <Link href="/feedback" className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4">
              フィードバック
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center">利用規約</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center">プライバシー</Link>
          </nav>
          <p className="mt-1 leading-relaxed">個人が運営する非公式のファンサービスです。ゲームの運営会社とは関係ありません。</p>
        </div>
      </footer>
      </div>

      <TabBar unread={unread} active={active} />
    </>
  );
}
