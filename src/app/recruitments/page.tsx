import { redirect } from 'next/navigation';

// v1 の一覧ページ。ホーム(募集フィード)に統合したため転送する
export default async function RecruitmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  if (sp.purpose) p.set('purpose', sp.purpose);
  if (sp.src) p.set('src', sp.src);
  const s = p.toString();
  redirect(s ? `/?${s}` : '/');
}
