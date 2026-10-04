import { Suspense } from 'react';
import Link from 'next/link';
import { NavProgress } from './NavProgress';
import { Bell, Plus } from 'lucide-react';
import { TabBar, type TabKey } from './TabBar';
import { LogoMark } from './LogoMark';
import { OnboardingProvider } from './ProfileSheet';

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
  sheetOpen = false,
}: {
  children: React.ReactNode;
  unread: number;
  signedIn: boolean;
  restricted: boolean;
  configured: boolean;
  /** タブの選択状態を URL ではなく明示的に指定する (プレビュー用) */
  active?: TabKey;
  /** 開発用プレビュー: プロフィールのシートを開いた状態で表示する */
  sheetOpen?: boolean;
}) {
  const nav = 'inline-flex min-h-11 items-center px-3 text-sm font-bold text-ink-2 underline-offset-[6px] decoration-2 decoration-signal hover:text-ink hover:underline';
  return (
    <OnboardingProvider initialOpen={sheetOpen}>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2">
        本文へ移動
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-floor/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1240px] items-center gap-4 px-4 lg:h-16 lg:px-8">
          <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 whitespace-nowrap" aria-label="コンパスマッチ ホーム">
            <LogoMark className="h-5 w-8 lg:h-6 lg:w-9" />
            <span className="truncate text-[19px] font-black tracking-[-0.03em] lg:text-[23px]">コンパスマッチ</span>
            <span className="type-tag border border-ink/60 px-1 text-[10px] text-ink-2">非公式</span>
          </Link>
          <nav aria-label="メニュー" className="ml-auto hidden items-center gap-1 lg:flex">
            <Link href="/" className={nav}>募集一覧</Link>
            {signedIn ? (
              <>
                <Link href="/notifications" className={`${nav} gap-1.5`}>
                  <Bell className="size-4" aria-hidden />
                  通知
                  {unread > 0 && (
                    <span className="type-tag min-w-5 bg-signal px-1 text-center leading-5 text-ink">
                      {unread > 99 ? '99+' : unread}
                      <span className="sr-only">件の未読</span>
                    </span>
                  )}
                </Link>
                <Link href="/me" className={nav}>マイページ</Link>
              </>
            ) : (
              <Link href="/transfer" className={nav}>引き継ぐ</Link>
            )}
            <Link href="/recruitments/new" className="btn-signal ml-3">
              <Plus className="size-4" strokeWidth={3} aria-hidden />
              募集する
            </Link>
          </nav>
          {!signedIn && (
            <Link href="/transfer" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold underline decoration-2 underline-offset-4 lg:hidden">
              引き継ぐ
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
          <p className="mt-1 leading-relaxed">非公式のファンサイトです。ゲームの運営会社とは関係ありません。</p>
        </div>
      </footer>
      </div>

      <TabBar unread={unread} active={active} />
    </OnboardingProvider>
  );
}
