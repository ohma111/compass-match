import type { MetadataRoute } from 'next';

// 検索に載せるのはホームと規約類だけ。個人のページ・管理画面は載せない。
// 募集の詳細は共有カード (X などのクローラー) のために開けておき、ページ側の noindex で検索から外す。
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://compass-match.vercel.app';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/me', '/users/', '/notifications', '/transfer', '/welcome', '/signup', '/login', '/auth/', '/api/', '/dev/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
