'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, House, Plus, UserRound } from 'lucide-react';

/** 下部タブバー。「＋募集する」は画面の中央に来るよう左右の幅をそろえている */
export function TabBar({ unread }: { unread: number }) {
  const path = usePathname() ?? '/';
  const isHome = path === '/' || path === '/recruitments';
  const isNew = path.startsWith('/recruitments/new');
  const isNotif = path.startsWith('/notifications');
  const isMe = path.startsWith('/me') || path.startsWith('/profile');
  const item = (active: boolean) =>
    `flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${active ? 'text-brand' : 'text-muted hover:text-fg'}`;

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto grid h-16 max-w-xl grid-cols-[2fr_1.6fr_1fr_1fr] items-stretch px-2">
        <Link href="/" className={item(isHome)} aria-current={isHome ? 'page' : undefined}>
          <House className="size-6" strokeWidth={isHome ? 2.5 : 2} aria-hidden />
          ホーム
        </Link>
        <div className="flex items-center justify-center">
          <Link
            href="/recruitments/new"
            aria-current={isNew ? 'page' : undefined}
            className={`-mt-5 flex h-14 min-w-24 items-center justify-center gap-1 rounded-2xl bg-brand px-2.5 text-[13px] font-extrabold text-brand-fg shadow-[0_0_0_4px_var(--color-bg),0_8px_28px_-4px_rgb(255_210_63/0.6)] transition active:scale-95 ${isNew ? 'ring-2 ring-brand/60 ring-offset-2 ring-offset-bg' : ''}`}
          >
            <Plus className="size-5" strokeWidth={3} aria-hidden />
            募集する
          </Link>
        </div>
        <Link href="/notifications" className={item(isNotif)} aria-current={isNotif ? 'page' : undefined}>
          <span className="relative">
            <Bell className="size-6" strokeWidth={isNotif ? 2.5 : 2} aria-hidden />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[1.15rem] rounded-full bg-danger px-1 text-center text-[10px] leading-[1.15rem] font-extrabold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
          <span>
            通知{unread > 0 && <span className="sr-only">(未読{unread}件)</span>}
          </span>
        </Link>
        <Link href="/me" className={item(isMe)} aria-current={isMe ? 'page' : undefined}>
          <UserRound className="size-6" strokeWidth={isMe ? 2.5 : 2} aria-hidden />
          マイページ
        </Link>
      </div>
    </nav>
  );
}
