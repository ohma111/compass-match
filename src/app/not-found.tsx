import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card space-y-3">
      <h1 className="text-lg font-bold">ページが見つかりません</h1>
      <p className="text-sm text-muted">募集が終了・削除されたか、表示できない状態の可能性があります。</p>
      <Link href="/" className="btn-primary w-full">募集一覧へ</Link>
    </div>
  );
}
