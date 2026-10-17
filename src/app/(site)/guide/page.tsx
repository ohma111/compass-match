import Link from '@/components/Link';

export const metadata = { title: '使い方' };

const LINK = 'underline underline-offset-4 decoration-ink/40 hover:decoration-ink';

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'プロフィールを作る',
    body: (
      <>
        <Link href="/me" className={LINK}>マイページ</Link>の「プロフィールを作成」で、ユーザー名とロールを決めます。
      </>
    ),
  },
  {
    title: '募集する',
    body: '下の「募集する」を押し、目的・開始・人数・ランク条件を選んで「募集する」を押します。',
  },
  {
    title: '参加する',
    body: '一覧から募集を選び、「参加する」を押します。承認制の募集は、募集者の承認を待ちます。',
  },
  {
    title: 'チャットで部屋番号を伝える',
    body: '部屋番号はチャットで送ります。発言は90分で消えます。',
  },
  {
    title: '別の端末で使う',
    body: (
      <>
        <Link href="/me" className={LINK}>マイページ</Link>の「引き継ぎコードを作る」でコードを作り、別の端末の<Link href="/transfer" className={LINK}>ログイン</Link>で入力します。
      </>
    ),
  },
];

export default function GuidePage() {
  return (
    <article className="mx-auto max-w-2xl text-[15px] leading-[1.9]">
      <h1 className="text-[28px] leading-tight font-black tracking-[-0.01em] lg:text-[36px]">使い方</h1>
      <ol className="mt-8 border-b-2 border-ink">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-t-2 border-ink py-4 lg:grid-cols-[3.5rem_minmax(0,1fr)]">
            <span className="font-mono text-[22px] leading-tight font-black text-signal-deep lg:text-[28px]">{i + 1}</span>
            <div>
              <h2 className="text-[17px] leading-snug font-black">{s.title}</h2>
              <p className="mt-1 leading-[1.8] text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
