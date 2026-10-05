'use client';
import { Share2 } from 'lucide-react';

/**
 * Xで共有。スマホは端末の共有シートを開く (X のアプリが入っていれば、文と URL が入った状態でアプリが開く)。
 * 共有シートがない環境 (PC など) は X の投稿画面を新しいタブで開く。
 */
export function ShareButton({ text, url, className }: { text: string; url: string; className?: string }) {
  const intent = `https://x.com/intent/post?${new URLSearchParams({ text, url }).toString()}`;
  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (!touch || typeof nav.share !== 'function') return;
    e.preventDefault();
    try {
      await nav.share({ text, url });
    } catch (err) {
      // 閉じただけなら何もしない。共有できなかったときは投稿画面へ
      if ((err as { name?: string }).name !== 'AbortError') window.open(intent, '_blank', 'noopener');
    }
  }
  return (
    <a href={intent} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      <Share2 className="size-4" aria-hidden />
      Xで共有
    </a>
  );
}
