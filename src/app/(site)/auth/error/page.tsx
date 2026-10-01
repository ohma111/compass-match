import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-[26px] leading-tight">ログインできませんでした</h1>
      <p className="text-sm text-slate">時間をおいて、もう一度お試しください。続く場合はフィードバックからお知らせください。</p>
      <Link href="/login" className="btn-primary w-full">ログイン画面へ</Link>
    </div>
  );
}
