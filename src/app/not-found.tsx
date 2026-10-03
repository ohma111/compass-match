import Link from 'next/link';
import { LogoMark } from '@/components/LogoMark';

// どのページにも当てはまらない URL 用 (共通の枠の外で表示される)
export default function NotFound() {
  return (
    <>
      <header className="bg-ink text-white">
        <div className="mx-auto flex h-13 max-w-[1240px] items-center px-4 lg:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-2.5">
            <LogoMark />
            <span className="type-heavy text-[16px]">コンパス遊び相手さがし</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 pt-10">
        <h1 className="font-display text-[26px] leading-tight">ページが見つかりません</h1>
        <Link href="/" className="btn-primary w-full">募集一覧へ</Link>
      </main>
    </>
  );
}
