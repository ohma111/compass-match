import Link from '@/components/Link';

export const metadata = { title: '運営者情報' };

const ROWS: [string, React.ReactNode][] = [
  ['サイト名', 'JOIN COMPASS'],
  ['内容', '「#コンパス」で一緒に遊ぶ相手を募集する非公式ファンサイト'],
  ['運営', '個人'],
  ['お問い合わせ', <Link key="c" href="/contact" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">お問い合わせ</Link>],
  ['注意', 'ゲームの開発・運営会社とは関係ありません。'],
];

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl text-[15px] leading-[1.9]">
      <h1 className="text-[28px] leading-tight font-black tracking-[-0.01em] lg:text-[36px]">運営者情報</h1>
      <dl className="mt-8 border-b-2 border-ink">
        {ROWS.map(([k, v]) => (
          <div key={k} className="border-t-2 border-ink py-4 lg:grid lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-x-3">
            <dt className="text-[13px] font-black text-slate">{k}</dt>
            <dd className="mt-1 lg:mt-0">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm">
        <Link href="/terms" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">利用規約</Link>
        <span className="mx-3 text-ink/30">/</span>
        <Link href="/privacy" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">プライバシーポリシー</Link>
      </p>
    </article>
  );
}
