'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const missingEnv = error.message?.includes('環境変数');
  return (
    <div className="card space-y-3">
      <h1 className="text-lg font-bold">エラーが発生しました</h1>
      <p className="text-sm text-muted">
        {missingEnv ? 'サーバーの設定(環境変数)が不足しています。運営者にお知らせください。' : '時間をおいて再度お試しください。'}
      </p>
      <button className="btn-primary" onClick={reset}>再読み込み</button>
    </div>
  );
}
