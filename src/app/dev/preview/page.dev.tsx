import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isPreviewEnabled } from '@/lib/preview';
import { PREVIEW_SCREENS as SCREENS } from '@/lib/preview';

export default function PreviewIndex() {
  if (!isPreviewEnabled()) notFound();
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-display text-2xl">開発用プレビュー</h1>
      <p className="text-sm text-slate">ダミーデータで主要画面を表示します (本番ビルドには含まれません)。</p>
      <ul className="space-y-1">
        {SCREENS.map((s) => (
          <li key={s}>
            <Link className="link" href={`/dev/preview/${s}`}>{s}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
