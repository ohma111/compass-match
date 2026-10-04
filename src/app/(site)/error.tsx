'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const missingEnv = error.message?.includes('環境変数');
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight">読み込めませんでした</h1>
      <p className="text-sm text-slate">
        {missingEnv
          ? 'サーバーの設定が足りません (運営者向け)'
          : 'もう一度読み込んでください'}
      </p>
      <button className="btn-primary w-full" onClick={reset}>もう一度読み込む</button>
    </div>
  );
}
