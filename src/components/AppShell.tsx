import { Suspense } from 'react';
import Link from '@/components/Link';
import { NavProgress } from './NavProgress';
import { CopyButton } from './CopyButton';
import { SUPPORT_CODE } from '@/lib/constants';
import { RankProvider } from './RankSheet';
import { DiscordProvider } from './DiscordSheet';
import { JoinAskProvider } from './JoinAskSheet';
import type { RankBand } from '@/lib/constants';
import { Bell, ChevronRight, Plus } from 'lucide-react';
import { TabBar, type TabKey } from './TabBar';
import { LogoMark } from './LogoMark';
import { Wordmark } from './Wordmark';
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
  rankReady = false,
  currentRank = null,
  notice = null,
  discordReady = false,
}: {
  children: React.ReactNode;
  unread: number;
  signedIn: boolean;
  restricted: boolean;
  configured: boolean;
  /** タブの選択状態を URL ではなく明示的に指定する (プレビュー用) */
  active?: TabKey;
  /** メンテナンスの予定・管理者向けの表示など、ページの上に出す帯 */
  notice?: React.ReactNode;
  /** Discord のユーザー名が連絡先に入っているか (VC ありの募集に参加するときに使う) */
  discordReady?: boolean;
  /** 開発用プレビュー: プロフィールのシートを開いた状態で表示する */
  sheetOpen?: boolean;
  /** v8: ランクが決まっているか (決まっていなければ募集・参加のときに聞く) と、今のランク */
  rankReady?: boolean;
  currentRank?: RankBand | null;
}) {
  const nav = 'inline-flex min-h-11 items-center px-3 text-sm font-bold text-ink-2 underline-offset-[6px] decoration-2 decoration-signal hover:text-ink hover:underline';
  return (
    <RankProvider ready={rankReady} current={currentRank}>
      <DiscordProvider ready={discordReady}>
      <JoinAskProvider>
      <OnboardingProvider initialOpen={sheetOpen}>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2">
        本文へ移動
      </a>
      <header className="sticky top-0 z-30 short:static border-b-2 border-ink bg-floor/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1240px] items-center gap-3 px-4 min-[400px]:gap-4 lg:h-16 lg:px-8">
          <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 whitespace-nowrap" aria-label="JOIN COMPASS ホーム">
            <LogoMark className="h-5 w-8 lg:h-6 lg:w-9" />
            <Wordmark className="truncate text-[16px] min-[400px]:text-[22px] lg:text-[28px]" />
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
                      <span className="sr-only">件の未読通知</span>
                    </span>
                  )}
                </Link>
                <Link href="/me" className={nav}>マイページ</Link>
              </>
            ) : (
              <>
                {/* 未登録でもマイページ (プロフィールの作成) を出す。スマホは下のタブバーにある */}
                <Link href="/me" className={nav}>マイページ</Link>
                <Link href="/transfer" className={nav}>ログイン</Link>
              </>
            )}
            <Link href="/recruitments/new" className="btn-signal ml-3">
              <Plus className="size-4" strokeWidth={3} aria-hidden />
              募集する
            </Link>
          </nav>
          {!signedIn && (
            <Link href="/transfer" className="ml-auto inline-flex min-h-11 shrink-0 items-center text-sm font-bold whitespace-nowrap underline decoration-2 underline-offset-4 lg:hidden">
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
        {notice}
        {restricted && (
          <p className="alert-error mb-6">
            このアカウントは現在、募集・参加・チャットを利用できません。心当たりがない場合は、フィードバックからお知らせください。
          </p>
        )}
        {children}
      </main>

      {/* スマホは下の固定バー (タブバーか募集ボタン、どちらも64px) の分だけ余白を取る */}
      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] text-xs short:pb-6 text-slate lg:px-8 lg:pb-12">
        <div className="border-t-2 border-ink pt-2 lg:pt-4">
          <nav aria-label="サイト情報">
            <ul className="divide-y divide-ink/15 text-[14px] font-bold text-ink lg:flex lg:gap-x-8 lg:divide-y-0 lg:text-xs">
              {[
                ['/feedback', 'フィードバック'],
                ['/terms', '利用規約'],
                ['/privacy', 'プライバシーポリシー'],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-12 items-center justify-between lg:min-h-11 lg:hover:underline lg:underline-offset-4">
                    {label}
                    <ChevronRight className="size-4 text-slate lg:hidden" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 flex max-w-[22rem] flex-wrap items-center justify-between gap-2 border-2 border-ink px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate">運営者の応援コード</p>
              <p className="font-mono text-[14px] font-bold tracking-[0.06em] text-ink">{SUPPORT_CODE}</p>
            </div>
            <CopyButton text={SUPPORT_CODE} label="コピー" small />
          </div>
          <p className="mt-3 leading-relaxed">
            非公式のファンサイトです。
            <br />
            ゲームの開発・運営会社とは関係ありません。
          </p>
        </div>
      </footer>
      </div>

      <TabBar unread={unread} active={active} />
      </OnboardingProvider>
      </JoinAskProvider>
      </DiscordProvider>
    </RankProvider>
  );
}
