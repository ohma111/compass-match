'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, House, Plus, UserRound } from 'lucide-react';

export type TabKey = 'home' | 'new' | 'notif' | 'me' | 'auth' | 'none';

function tabOf(path: string): TabKey {
  if (path === '/' || path === '/recruitments') return 'home';
  if (path.startsWith('/recruitments/new')) return 'new';
  if (path.startsWith('/notifications')) return 'notif';
  if (path.startsWith('/me') || path.startsWith('/profile')) return 'me';
  if (['/signup', '/login', '/welcome', '/transfer'].some((p) => path.startsWith(p))) return 'auth';
  return 'none';
}

/** 下部タブバー (スマホのみ)。「＋募集する」は画面の中央に来るよう左右の幅をそろえている */
export function TabBar({ unread, active }: { unread: number; active?: TabKey }) {
  const path = usePathname() ?? '/';
  const current = active ?? tabOf(path);
  const item = (on: boolean) =>
    `relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${on ? 'text-ink' : 'text-slate hover:text-ink'}`;
  const bar = <span aria-hidden className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 bg-ink" />;

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-floor pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-xl grid-cols-4 items-stretch">
        <Link href="/" className={item(current === 'home')} aria-current={current === 'home' ? 'page' : undefined}>
          {current === 'home' && bar}
          <House className="size-6" strokeWidth={current === 'home' ? 2.5 : 2} aria-hidden />
          ホーム
        </Link>
        <Link href="/recruitments/new" className="m-1.5 flex flex-col items-center justify-center gap-0.5 bg-signal text-xs font-black text-ink active:bg-[#ff6a40]">
          <Plus className="size-6" strokeWidth={3} aria-hidden />
          募集する
        </Link>
        <Link href="/notifications" className={item(current === 'notif')} aria-current={current === 'notif' ? 'page' : undefined}>
          {current === 'notif' && bar}
          <span className="relative">
            <Bell className="size-6" strokeWidth={current === 'notif' ? 2.5 : 2} aria-hidden />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-3 min-w-[1.2rem] bg-signal px-1 text-center font-mono text-[11px] leading-[1.2rem] font-bold text-ink">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
          <span>
            通知{unread > 0 && <span className="sr-only">(未読{unread}件)</span>}
          </span>
        </Link>
        <Link href="/me" className={item(current === 'me')} aria-current={current === 'me' ? 'page' : undefined}>
          {current === 'me' && bar}
          <UserRound className="size-6" strokeWidth={current === 'me' ? 2.5 : 2} aria-hidden />
          マイページ
        </Link>
      </div>
    </nav>
  );
}
