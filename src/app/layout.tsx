import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { Suspense } from 'react';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { BootSplash } from '@/components/BootSplash';

// v5「タイムテーブル」: 時刻・数字は Archivo (幅を詰めた太字)、日本語は Zen Kaku Gothic New、札は JetBrains Mono
const display = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-display-face',
});
const mono = JetBrains_Mono({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-face',
});
// 日本語は文字の範囲ごとに約80ファイル×4太さに分かれている。先読みすると初回に315ファイル・約3.5MBを
// 取りに行くので先読みしない (ブラウザが画面に出る文字の分だけ取る。見た目は同じ)
const text = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-text',
});

const DESCRIPTION = '#コンパスで一緒に遊ぶ人を探せる募集掲示板です。バトルアリーナ・フリーバトル・大会練習・カスタム。非公式のファンサイトです。';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://compass-match.vercel.app'),
  title: { default: 'JOIN◆COMPASS | #コンパスの募集掲示板 (非公式)', template: '%s | JOIN◆COMPASS' },
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  appleWebApp: { capable: true, title: 'JOIN COMPASS', statusBarStyle: 'default' },
  // X・Discord・LINE で URL を貼ったときのカード (画像は opengraph-image.tsx)
  openGraph: { siteName: 'JOIN◆COMPASS', title: 'JOIN◆COMPASS | #コンパスの募集掲示板 (非公式)', description: DESCRIPTION, locale: 'ja_JP', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

// すべてのページはログイン状態に依存するため、動的レンダリングにする
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#efede6',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${text.variable} ${mono.variable}`} style={{ backgroundColor: '#efede6' }}>
      <body className="min-h-dvh font-sans antialiased" style={{ backgroundColor: '#efede6' }}>
        {/* 最初の表示でサーバーの応答を待つ間 (ログイン確認など) は、真っ白/真っ黒ではなく待機画面を出す */}
        <Suspense fallback={<BootSplash />}>{children}</Suspense>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
