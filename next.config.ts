import type { NextConfig } from 'next';
import { pageExtensionsFor } from './src/lib/preview';
import { SUPABASE_PROJECT_REF, refFromUrl } from './src/lib/supabase-ref';

// src/proxy.ts はログイン Cookie の名前 (sb-<ref>-auth-token) で動くかを決めている。
// 接続先の Supabase と ref が違うと、ログイン中の方のセッションが更新されなくなるので、ビルドを止める。
const envRef = refFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (envRef && envRef !== SUPABASE_PROJECT_REF) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL の ref (${envRef}) が src/lib/supabase-ref.ts (${SUPABASE_PROJECT_REF}) と違います。src/lib/supabase-ref.ts と src/proxy.ts の matcher を直してください。`,
  );
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/**
 * `*.dev.tsx` のページ (開発用のフィクスチャプレビュー /dev/preview) は `next dev` のときだけルートになる。
 * 本番ビルド (NODE_ENV=production) では拡張子の一覧に入らないので、ルートとして存在しない。
 * tests/preview-guard.test.ts と scripts/check-no-preview.mjs (npm run build の後に自動実行) で確認している。
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  pageExtensions: pageExtensionsFor(process.env.NODE_ENV),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
