import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getViewerSafe } from '@/lib/viewer-safe';
import { isSupabaseConfigured, features } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { isRestricted } from '@/lib/auth';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

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
  themeColor: '#5b3df5',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerSafe();
  const unread = viewer ? await unreadCount(viewer.userId) : 0;
  const restricted = isRestricted(viewer?.profile ?? null);

  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
            <Link href="/" className="mr-auto text-base font-bold">
              コンパス遊び相手さがし
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/recruitments" className="rounded px-2 py-1">一覧</Link>
              {features.availableNow && <Link href="/now" className="rounded px-2 py-1">今から</Link>}
              {viewer ? (
                <>
                  <Link href="/notifications" className="relative rounded px-2 py-1" aria-label={`通知 未読${unread}件`}>
                    通知
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/me" className="rounded px-2 py-1">マイページ</Link>
                </>
              ) : (
                <Link href="/login" className="rounded px-2 py-1 font-bold text-brand">ログイン</Link>
              )}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-5">
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
        </main>

        <footer className="mx-auto max-w-2xl space-y-2 border-t border-line px-4 py-6 text-xs text-muted">
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/feedback" className="font-bold text-brand">フィードバックを送る</Link>
            <Link href="/terms">利用規約</Link>
            <Link href="/privacy">プライバシーポリシー</Link>
            {viewer?.isAdmin && <Link href="/admin">管理画面</Link>}
          </nav>
          <p>
            本サービスは個人が運営する非公式のファンサービスです。ゲームの運営会社とは関係ありません。
          </p>
        </footer>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
