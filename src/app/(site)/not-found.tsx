import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-[26px] leading-tight">ページが見つかりません</h1>
      <Link href="/" className="btn-primary w-full">募集一覧へ</Link>
    </div>
  );
}
