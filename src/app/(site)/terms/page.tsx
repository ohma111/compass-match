export const metadata = { title: '利用規約' };

// ※雛形です。公開前に運営者本人が内容を確認・修正してください。
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed">
      <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">利用規約 (雛形)</h1>
      <p className="alert-error">この規約は雛形です。公開前に運営者が内容を確認してください。</p>
      <p>最終更新日: 2026年9月30日</p>
      <section className="space-y-1">
        <h2 className="font-bold">第1条 (本サービス)</h2>
        <p>本サービスは、スマートフォンゲーム「#コンパス」のプレイヤー同士が一緒に遊ぶ相手を募集するための、個人が運営する非公式のファンサービスです。ゲームの開発・運営会社とは一切関係ありません。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第2条 (利用資格)</h2>
        <p>13歳未満の方は本サービスを利用できません。18歳未満の方は、保護者の同意を得たうえで利用してください。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第3条 (禁止事項)</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>他の利用者への嫌がらせ、誹謗中傷、差別的な言動</li>
          <li>出会いを目的とした利用、性的な内容の投稿、性別を条件とした募集</li>
          <li>外部サイトへの誘導、宣伝、勧誘、金銭のやり取り、アカウントの売買</li>
          <li>自分や他人の個人情報(本名、住所、電話番号、学校名など)の投稿</li>
          <li>虚偽の通報、複数アカウントの作成、なりすまし</li>
          <li>ゲームの利用規約に違反する行為(チート、代行等)の募集</li>
          <li>法令または公序良俗に反する行為</li>
        </ul>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第4条 (連絡先の開示)</h2>
        <p>プロフィールに登録した連絡先は、利用者が募集で参加を承認した相手、または参加が承認された募集のメンバーにのみ表示されます。開示後のやり取りは利用者の責任で行ってください。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第5条 (通報・利用制限)</h2>
        <p>複数の利用者から通報された投稿・アカウントは、自動的に一時非表示になる場合があります。運営者は、禁止事項に該当すると判断した場合、事前の通知なく投稿の削除、利用停止、利用禁止(BAN)を行うことができます。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第6条 (チャット)</h2>
        <p>募集ごとのチャットは、募集終了から一定時間(初期設定6時間)が経過すると自動的に削除されます。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第7条 (免責)</h2>
        <p>運営者は、利用者間のトラブル、本サービスの停止・変更・終了によって生じた損害について、運営者の故意または重大な過失による場合を除き責任を負いません。本サービスは予告なく内容を変更・終了することがあります。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">第8条 (規約の変更)</h2>
        <p>運営者は本規約を変更できるものとし、変更後の規約は本ページに掲載した時点で効力を生じます。</p>
      </section>
    </article>
  );
}
