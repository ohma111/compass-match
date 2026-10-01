export const metadata = { title: 'プライバシーポリシー' };

// ※雛形です。公開前に運営者本人が内容を確認・修正してください。
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 text-[15px] leading-relaxed">
      <h1 className="font-display text-[26px] leading-tight lg:text-[34px]">プライバシーポリシー (雛形)</h1>
      <p className="alert-error">このポリシーは雛形です。公開前に運営者が内容を確認してください。</p>
      <p>最終更新日: 2026年9月30日</p>
      <section className="space-y-1">
        <h2 className="font-bold">1. 取得する情報</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>ユーザーIDとパスワード。パスワードは認証サービス(Supabase Auth)が復元できない形(ハッシュ)で保存し、運営者も見ることはできません。ユーザーIDは他の利用者には表示しません。引き継ぎコードも復元できない形でのみ保存します。</li>
          <li>Discordでログインした場合は、DiscordアカウントのID・表示名・メールアドレス(提供される場合)。認証のためにのみ使用し、他の利用者には表示しません。</li>
          <li>登録・パスワード再設定の回数制限のため、接続元IPアドレスを復元できない形に変換した値(2日以内に自動削除)</li>
          <li>利用者が入力したプロフィール、募集、チャット、通報、フィードバックの内容</li>
          <li>連絡先(Discord ID / X ID / ゲーム内ID)のうち、利用者が入力したもの</li>
          <li>流入元の識別子(URLの src パラメータ。例: 「x」「guild」)。個人を特定するものではありません。</li>
        </ul>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">2. 利用目的</h2>
        <p>本サービスの提供、不正利用の防止、利用状況の集計(個人を特定しない形)、サービス改善のために利用します。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">3. 第三者への提供</h2>
        <p>法令に基づく場合を除き、第三者に提供しません。データは委託先(Supabase: データベース/認証、Vercel: ホスティング)のサーバーに保存されます。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">4. 保存期間</h2>
        <p>チャットは募集終了から約6時間後に自動削除します。その他の情報はアカウント削除の申し出まで保存します。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">5. 開示・削除の請求</h2>
        <p>アカウントや情報の削除を希望する場合は、フィードバックフォームからご連絡ください。</p>
      </section>
      <section className="space-y-1">
        <h2 className="font-bold">6. Cookie</h2>
        <p>ログイン状態の維持と、流入元の記録(30日間)のためにCookieを使用します。広告目的のCookieは使用しません。</p>
      </section>
    </article>
  );
}
