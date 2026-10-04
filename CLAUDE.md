# CLAUDE.md — 引き継ぎメモ

このファイルは次の作業セッション向け。まず README.md で仕様と本番設定を確認すること。

## 運営者について
- 1人で開発・運営。日本語でやり取りする。
- 自分の意見も疑って、いろんな角度から考えてほしいタイプ。代案や弱点ははっきり言う。
- 文言は「AIっぽい説明」が嫌い。機能を説明する文章、「〜できます」、安心させる前置きは書かない。ボタンと見出しで分かるようにする。
- デザインの品質基準は Awwwards / Webby / FWA 級。自己採点は甘くなるので、作っていない別エージェントに審査させる(過去の点数は docs/design-review.md)。
- 規約・プライバシーポリシーはガチガチでなくてよい。

## 運営者からもらっている許可
- 本番サイトに試験用アカウントを作って挙動を試してよい。試験後のテストデータの削除もしてよい(運営者・実ユーザーのデータは消さない)。
- ブラウザ操作(Supabase / Vercel / GitHub / Discord のダッシュボード)、参考サイトの閲覧、Node.js のダウンロード。
- **お金がかかる操作の前は必ず止めて確認する**(有料プラン、独自ドメインなど)。
- パスワード・秘密鍵(Client Secret、service role キーなど)の入力やアカウント作成は、運営者本人にやってもらう。

## 作業のコツ(これまでのやり方)
- コードは GitHub `ohma111/compass-match`(Claude の GitHub アプリ導入済みで push 可)。main に push すると Vercel が自動デプロイ。
- マイグレーションの本番適用は、ブラウザで Supabase の SQL Editor を開き、`window.monaco.editor.getEditors()[0].setValue(...)` で中身を入れ、SHA-256 をローカルの `sha256sum` と照合してから Run ボタンを JS でクリック。「destructive operations」の確認ダイアログが出たら `[role=alertdialog]` の「Run query」を押す。
- デプロイ完了の確認は、Vercel のタブで `fetch('/api/v6/deployments?app=compass-match&limit=1&slug=acme-5e8c')` の state を見る。
- この作業環境(クラウド)から本番サイトと Supabase に直接つながる。本番の通し試験は `scripts/e2e-live/run.mjs`(Playwright。Chromium は /opt/pw-browsers、`playwright install` はしない)。
- 作業環境は会話ごとに別。リポジトリは clone し直すこと。

## 2026-10-04 の作業 (v5) で終わったこと
- 速さ: ページ側のログイン確認を `getClaims()` (署名鍵が ES256 なので手元で検証、通信なし) にし、`cache()` でレイアウトとページで1回に。ホーム・詳細のクエリを並列化。ログイン状態の応答は米国からの計測で 0.8〜1.2秒 → 約0.5秒 (日本からはさらに約0.2秒短い)。書き込み (Server Action) は今も `getUser()` でサーバーに確認している。
- 読み込み中: 各ページに `loading.tsx` (時間割の形の骨組み)。上端の朱のバーは骨組みが消えるまで走る (`NavProgress` + `LoadingSignal`)。
- 名前は「コンパスマッチ」(運営者が選択)。デザインは B「タイムテーブル」: 紙 #efede6・墨・朱 #ff4a1c の1色。目的は色でなく形の刻印 (■●▲◆)。席は「ロール(剣・銃・盾・足) + ランク」、ロール未登録は ID から作る 5×5 の模様 (`Emblem`)。名前の頭文字はやめた。
- 規約・プライバシーポリシーを普段の言葉で書き直し (雛形の注意書きを削除)。`TERMS_VERSION` は変えていない (再同意は求めない)。
- 無料枠の対策: migration 9 (本番適用済み) で定期処理に古いデータの削除を追加 (終わって60日の募集・30日の通知・プロフィールなし3日の匿名アカウント・pg_cron の7日より前の記録)。管理画面に「容量」タブ。募集詳細の自動更新は、触らずに置くと15秒→45秒→120秒に間隔を空ける。
- kumagi.com/motions は Go/Ebitengine 製でライセンス表記がないので、コードは持ち込まず考え方 (重なり・ヒットストップ・罫を引く) だけ CSS で使った。
- 審査は別エージェントで3周 (docs/design-review.md の v5 節)。

## 次にやること (候補)
- テスト用の匿名アカウント (テストA / テストB / 計測テスト) が本番に残っている。消すかは運営者に確認する。
- 審査の残り: スマホ詳細で朱の席と黒い「参加する」が両方ある、PC 詳細の右列の下が空く。
- 実機 (iPhone Safari) で新しいデザインの文字のつぶれ・`word-break: auto-phrase` の効き (Safari は未対応で普通の改行になる) を見る。

## 残っている弱点(把握済み)
- 匿名アカウントは端末を変えると別人扱い(引き継ぎコードで対応)。荒らしが出たら Cloudflare Turnstile(無料)を足す。
- iPhone で1週間以上ログインが保たれるかは実機で未確認(サーバー側で Cookie を 400 日で更新し直す対策は済み)。
- X ログインは未設定(有料プランが要る可能性があり見送り)。
- 集客(ギルド外の人に届く入口)は機能では解決しない。告知リンクには `?src=guild` `?src=x` などを付け、管理画面の指標で見る。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
