'use client';
import { useEffect, useState, useTransition } from 'react';
import { adminCompactAction, adminDbSizeAction } from '@/app/actions';
import { formatJstTime } from '@/lib/time';

const FREE_DB_BYTES = 500 * 1024 * 1024;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** データベースの容量を10秒ごとに読み直して出す。「容量を詰める」で、消したデータの分だけファイルを小さくする */
export function LiveDbSize({ initialBytes, initialScheduled }: { initialBytes: number; initialScheduled: boolean }) {
  const [bytes, setBytes] = useState(initialBytes);
  const [at, setAt] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(initialScheduled);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      const r = await adminDbSizeAction();
      if (stop || !r.ok || !r.data) return;
      setBytes(r.data.db_bytes);
      setAt(r.data.at);
      setScheduled(r.data.compact_scheduled);
    };
    const t = window.setInterval(tick, 10_000);
    void tick();
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  const ratio = bytes / FREE_DB_BYTES;
  const warn = ratio >= 0.6;
  return (
    <div className={`card ${warn ? 'border-signal-deep' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold">データベース</p>
        <p className="text-xs text-slate" aria-live="polite">
          <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-ok align-middle" aria-hidden />
          {at ? `${formatJstTime(at)} 時点` : '読み込み中'}
        </p>
      </div>
      <p className="type-time mt-1 text-[40px]">
        {mb(bytes)} <span className="text-[20px] text-slate">/ 500 MB</span>
      </p>
      <div className="mt-2 h-3 border-2 border-ink">
        <div className={`h-full ${warn ? 'bg-signal' : 'bg-ink'}`} style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }} />
      </div>
      {warn && <p className="mt-2 font-bold text-signal-deep">容量の6割を超えました。下の「大きい表」を確認し、保存日数 (app_settings) を短くしてください。</p>}
      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <p className="text-xs leading-relaxed text-slate">
          データを消しても、空いた場所はそのまま残るので数字はすぐには減りません。「容量を詰める」を押すと、1分以内に空いた場所を詰めてファイルを小さくします。Supabase の仕組みの分 (約10〜20MB) は消せません。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={pending || scheduled}
            onClick={() => {
              if (!window.confirm('容量を詰めますか？ 数秒だけ書き込みが止まることがあります。')) return;
              start(async () => {
                const r = await adminCompactAction();
                setMsg(r.ok ? (r.message ?? null) : r.error);
                if (r.ok) setScheduled(true);
              });
            }}
          >
            {scheduled ? '詰める予定です' : pending ? '予約しています…' : '容量を詰める'}
          </button>
          {msg && <span className="text-xs text-slate" role="status">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
