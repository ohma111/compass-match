'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProfileStartForm } from '@/components/ProfileSheet';

/** マイページ (プロフィールがまだない人): 席をつくるフォームが主。以前から使っている方の入口は見出しのすぐ下に */
export function GuestMeView() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-[28px] leading-tight font-black tracking-[-0.01em] lg:text-[36px]">プロフィールを作成</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-5 border-y-2 border-ink py-1 text-[13px]">
        <span className="w-full font-bold text-slate">以前から使っていた方</span>
        <Link href="/transfer" className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4">
          ログイン
        </Link>
      </p>
      <div className="mt-6">
        <ProfileStartForm page autoFocus={false} onDone={() => router.refresh()} />
      </div>
    </div>
  );
}
