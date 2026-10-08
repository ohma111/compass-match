import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://compass-match.vercel.app';
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/terms`, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: 'monthly', priority: 0.2 },
  ];
}
