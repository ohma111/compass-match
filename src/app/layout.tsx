import type { Metadata, Viewport } from 'next';
import { Dela_Gothic_One, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

// 見出し・数字: Dela Gothic One (1ウェイトの極太)。本文: Zen Kaku Gothic New
const display = Dela_Gothic_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-face',
});
const text = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-text',
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
  themeColor: '#16161d',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${text.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
