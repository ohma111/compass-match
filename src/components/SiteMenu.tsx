'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import Link from '@/components/Link';
import { ChevronRight, Menu, X } from 'lucide-react';
import { SITE_LINKS } from '@/lib/site-links';

/** ヘッダー右上のボタンと、右から出るメニュー */
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // ヘッダーの backdrop-blur の中では fixed がヘッダーの大きさに閉じ込められるので body に出す
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // 移動したら閉じる
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex size-11 shrink-0 items-center justify-center"
        aria-label="メニュー"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-6" aria-hidden />
      </button>
      {mounted && createPortal(
      <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <nav
          id="site-menu"
          aria-label="サイトのメニュー"
          className={`absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l-2 border-ink bg-floor pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
          inert={!open}
        >
          <div className="flex h-13 items-center justify-end border-b-2 border-ink px-2 lg:h-16">
            <button type="button" className="inline-flex size-11 items-center justify-center" aria-label="閉じる" onClick={() => setOpen(false)}>
              <X className="size-6" aria-hidden />
            </button>
          </div>
          <ul className="divide-y divide-ink/15 px-4 text-[15px] font-bold">
            {SITE_LINKS.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center justify-between" onClick={() => setOpen(false)}>
                  {label}
                  <ChevronRight className="size-4 text-slate" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>,
      document.body,
      )}
    </>
  );
}
