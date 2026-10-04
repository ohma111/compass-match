/** 利用規約・プライバシーポリシーの共通の形: 番号付きの項目を太い罫で区切る */
export function LegalPage({
  title,
  updated,
  items,
}: {
  title: string;
  updated: string;
  items: { h: string; body?: string[]; list?: string[] }[];
}) {
  return (
    <article className="mx-auto max-w-2xl text-[15px] leading-relaxed">
      <h1 className="text-[28px] leading-tight font-black tracking-[-0.01em] lg:text-[36px]">{title}</h1>
      <p className="type-tag mt-2 text-slate">最終更新 {updated}</p>
      <ol className="mt-8 border-b-2 border-ink">
        {items.map((it, i) => (
          <li key={it.h} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-t-2 border-ink py-5 lg:grid-cols-[4rem_minmax(0,1fr)]">
            <span className="type-time text-[26px] text-ink/30 lg:text-[34px]">{String(i + 1).padStart(2, '0')}</span>
            <div className="space-y-2">
              <h2 className="text-[17px] font-black">{it.h}</h2>
              {it.body?.map((p) => <p key={p}>{p}</p>)}
              {it.list && (
                <ul className="list-disc space-y-1 pl-5 marker:text-signal">
                  {it.list.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
