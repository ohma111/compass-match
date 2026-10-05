import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

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
const text = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-text',
});

export const metadata: Metadata = {
  title: { default: 'コンパス・マッチング | #コンパスの募集掲示板 (非公式)', template: '%s | コンパス・マッチング' },
  description: '#コンパスで一緒に遊ぶ人を探せる募集掲示板です。バトルアリーナ・フリーバトル・大会練習・カスタム。非公式のファンサイトです。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
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
    <html lang="ja" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
