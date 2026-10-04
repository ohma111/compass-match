import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight">ログインできませんでした</h1>
      <p className="text-sm text-slate">もう一度試してみてください</p>
      <Link href="/login" className="btn-primary w-full">ログイン画面へ</Link>
    </div>
  );
}
