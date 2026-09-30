import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="card space-y-3">
      <h1 className="text-lg font-bold">ログインできませんでした</h1>
      <p className="text-sm text-muted">時間をおいて、もう一度お試しください。続く場合はフッターのフィードバックからお知らせください。</p>
      <Link href="/login" className="btn-primary w-full">ログイン画面へ</Link>
    </div>
  );
}
