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
    <article className="mx-auto max-w-2xl text-[15px] leading-[1.9]">
      <h1 className="text-[28px] leading-tight font-black tracking-[-0.01em] lg:text-[36px]">{title}</h1>
      <p className="type-tag mt-2 text-slate">最終更新 {updated}</p>
      <ol className="mt-8 border-b-2 border-ink">
        {items.map((it, i) => (
          <li key={it.h} className="border-t-2 border-ink py-5 lg:grid lg:grid-cols-[4rem_minmax(0,1fr)] lg:gap-x-3">
            <span className="type-time block text-[18px] text-slate lg:text-[34px] lg:text-ink/30" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
            <div className="mt-1 space-y-2 lg:mt-0">
              <h2 className="text-[17px] leading-snug font-black">{it.h}</h2>
              {it.body?.map((p) => <p key={p}>{p}</p>)}
              {it.list && (
                <ul className="list-disc space-y-2 pl-5 marker:text-ink/40">
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
