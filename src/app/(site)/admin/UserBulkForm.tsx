'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminBulkUsersAction } from '@/app/actions';
import type { ActionResult } from '@/lib/types';

/**
 * ユーザー一覧のまとめて操作。一覧 (サーバー側で描画) の中のチェックボックス (name="uid") を見て、
 * 選んだ人をまとめて BAN / 削除する。管理者・守られているアカウントにはチェックボックスを出さない。
 */
export function UserBulkForm({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();

  const inputs = () => Array.from(box.current?.querySelectorAll<HTMLInputElement>('input[name="uid"]') ?? []);
  const sync = () => {
    const all = inputs();
    setTotal(all.length);
    setSelected(all.filter((i) => i.checked).map((i) => i.value));
  };
  // ページを移ったら (一覧が入れ替わったら) 選択を数え直す
  useEffect(sync, [children]);
  useEffect(() => {
    if (!result?.ok) return;
    const t = window.setTimeout(() => setResult(null), 3000);
    return () => window.clearTimeout(t);
  }, [result]);

  const toggleAll = (on: boolean) => {
    for (const i of inputs()) i.checked = on;
    sync();
  };
  const run = (op: 'ban' | 'delete') => {
    const n = selected.length;
    const msg =
      op === 'delete'
        ? `選んだ${n}人のアカウントを削除しますか？ プロフィール・募集・チャットがすべて消え、元に戻せません。`
        : `選んだ${n}人をBANしますか？ 進行中の募集は取り消されます。`;
    if (!window.confirm(msg)) return;
    start(async () => {
      const r = await adminBulkUsersAction(selected, op);
      setResult(r);
      if (r.ok) {
        toggleAll(false);
        router.refresh();
      }
    });
  };

  const allOn = total > 0 && selected.length === total;
  return (
    <div className="space-y-2">
      <div className="sticky top-14 z-20 short:static flex flex-wrap items-center gap-2 border-2 border-ink bg-floor px-3 py-2 lg:top-17">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-ink)]"
            checked={allOn}
            disabled={total === 0 || pending}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          このページをすべて選ぶ
        </label>
        <span className="font-mono text-sm tabular-nums">{selected.length}人を選択中</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-danger btn-sm" disabled={pending || selected.length === 0} onClick={() => run('ban')}>
            まとめてBAN
          </button>
          <button type="button" className="btn-outline btn-sm text-danger" disabled={pending || selected.length === 0} onClick={() => run('delete')}>
            {pending ? '処理中…' : 'まとめて削除'}
          </button>
        </span>
        {result && (
          <p className={`w-full text-xs ${result.ok ? 'text-ok' : 'text-danger'}`} role={result.ok ? 'status' : 'alert'}>
            {result.ok ? result.message : result.error}
          </p>
        )}
      </div>
      <div ref={box} onChange={sync}>
        {children}
      </div>
    </div>
  );
}
