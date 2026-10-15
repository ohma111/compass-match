import { permanentRedirect } from 'next/navigation';

// フィードバックはお問い合わせにまとめた。前の URL は移す。
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  permanentRedirect(sp.from ? `/contact?from=${encodeURIComponent(sp.from)}` : '/contact');
}
