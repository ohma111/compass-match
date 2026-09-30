import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { M_PLUS_1p } from 'next/font/google';
import './globals.css';
import { getViewerSafe } from '@/lib/viewer-safe';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { isRestricted } from '@/lib/auth';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { TabBar } from '@/components/TabBar';

const mplus = M_PLUS_1p({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mplus',
});

export const metadata: Metadata = {
  title: { default: 'コンパス遊び相手さがし', template: '%s | コンパス遊び相手さがし' },
  description: '#コンパスで、今この時間に一緒に遊べる人を見つけるための募集掲示板(非公式ファンサービス)',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

// すべてのページはログイン状態に依存するため、動的レンダリングにする
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0c16',
  colorScheme: 'dark',
};

async function unreadCount(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#1b2038" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#lg)" strokeWidth="2.5" />
      <path d="M16 7.5 L19 16 L16 24.5 L13 16 Z" fill="url(#lg)" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerSafe();
  const unread = viewer ? await unreadCount(viewer.userId) : 0;
  const restricted = isRestricted(viewer?.profile ?? null);

  return (
    <html lang="ja" className={mplus.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex h-12 max-w-xl items-center px-4">
            <Link href="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap">
              <LogoMark />
              <span className="truncate text-[15px] font-extrabold tracking-wide">
                コンパス<span className="text-brand">遊び相手</span>さがし
              </span>
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-xl px-4 pt-4 pb-32">
          {!isSupabaseConfigured() && (
            <p className="alert-error mb-4">
              サーバーの設定(Supabase環境変数)が未完了です。README の手順に従って設定してください。
            </p>
          )}
          {restricted && (
            <p className="alert-error mb-4">
              このアカウントは現在、募集・参加・チャットを利用できません。心当たりがない場合はフィードバックからお問い合わせください。
            </p>
          )}
          {children}

          <footer className="mt-12 space-y-2 border-t border-line/60 pt-5 text-xs text-muted">
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/feedback" className="inline-flex min-h-11 items-center font-bold text-brand">フィードバック</Link>
              <Link href="/terms" className="inline-flex min-h-11 items-center">利用規約</Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center">プライバシー</Link>
            </nav>
            <p>個人が運営する非公式のファンサービスです。ゲームの運営会社とは関係ありません。</p>
          </footer>
        </main>

        <TabBar unread={unread} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
