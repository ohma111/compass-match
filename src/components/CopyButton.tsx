'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label = 'コピー', onInk = false, small = false }: { text: string; label?: string; onInk?: boolean; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 古いブラウザ向けのフォールバック
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  const fill = onInk ? (done ? '#ff4a1c' : '#ffffff') : done ? 'var(--color-ok)' : 'var(--color-ink)';
  return (
    <button
      type="button"
      onClick={copy}
      className={`btn ${small ? 'min-h-9 min-w-20 px-2.5 text-[12px]' : 'min-w-28'} ${onInk ? 'text-ink' : 'text-white'}`}
      style={{ background: fill }}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{done ? 'コピーしました' : label}</span>
    </button>
  );
}
