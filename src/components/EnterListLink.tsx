'use client';
import { useRouter } from 'next/navigation';
import { COVER_SEEN_COOKIE } from '@/lib/cover';

/** 表紙の「募集を見る」。表紙を見た印の Cookie を付けて一覧 (/) を読み直す */
export function EnterListLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <a
      href="/"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        document.cookie = `${COVER_SEEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {children}
    </a>
  );
}
