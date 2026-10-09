'use client';
import { useEffect, useState } from 'react';
import { adminDbSizeAction } from '@/app/actions';
import { formatJstTime } from '@/lib/time';

const FREE_DB_BYTES = 500 * 1024 * 1024;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** データベースの容量を1分ごとに読み直して出す */
export function LiveDbSize({ initialBytes }: { initialBytes: number }) {
  const [bytes, setBytes] = useState(initialBytes);
  const [at, setAt] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      const r = await adminDbSizeAction();
      if (stop || !r.ok || !r.data) return;
      setBytes(r.data.db_bytes);
      setAt(r.data.at);
    };
    const t = window.setInterval(tick, 60_000);
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
      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-slate">
        データを消しても、空いた場所はすぐには数字に出ません (自動の VACUUM が少しずつ使い回します)。Supabase の仕組みの分 (約10〜20MB) は消せません。
      </p>
    </div>
  );
}
