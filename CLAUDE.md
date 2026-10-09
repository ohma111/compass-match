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
- 名前は「コンパスマッチ」(運営者が選択。v8 で「コンパス・マッチング」に変更)。デザインは B「タイムテーブル」: 紙 #efede6・墨・朱 #ff4a1c の1色。目的は色でなく形の刻印 (■●▲◆)。席は「ロール(剣・銃・盾・足) + ランク」、ロール未登録は ID から作る 5×5 の模様 (`Emblem`)。名前の頭文字はやめた。
- 規約・プライバシーポリシーを普段の言葉で書き直し (雛形の注意書きを削除)。`TERMS_VERSION` は変えていない (再同意は求めない)。
- 無料枠の対策: migration 9 (本番適用済み) で定期処理に古いデータの削除を追加 (終わって60日の募集・30日の通知・プロフィールなし3日の匿名アカウント・pg_cron の7日より前の記録)。管理画面に「容量」タブ。募集詳細の自動更新は、触らずに置くと15秒→45秒→120秒に間隔を空ける。
- kumagi.com/motions は Go/Ebitengine 製でライセンス表記がないので、コードは持ち込まず考え方 (重なり・ヒットストップ・罫を引く) だけ CSS で使った。
- 審査は別エージェントで3周 (docs/design-review.md の v5 節)。

## 2026-10-05 の作業 (v6) で終わったこと
- 募集: 部屋番号の入力欄を作成画面から削除 (参加が決まったあと詳細で入れる・カスタムは毎回更新できる)。目的は「バトルアリーナ / フリーバトル / 大会練習 / カスタム」。「ゲームへの姿勢」(勝ちたい / 楽しみたい、DB は stance = win / fun) を必須に。開始は「今すぐ / 今日 / 明日」+ 15分刻み。ランクは高い順に並べ、表記は「S8↑ / S7–5 / S4–1 / A–F」、条件は「S5↑」(運営者の指定。審査では「範囲が逆に読める」と指摘あり、運営者に伝え済み)。
- チャット: 1回20文字、3秒に1件・1分に8件・同じ文は1分以内に1回。禁止語 (src/lib/moderation/banned.ts と migration 10 の private.banned_terms、tests/banned.test.ts で一致を確認) はチャット・ひとこと・表示名・自己紹介で弾き、過去の発言に含まれていれば表示しない。メールアドレスと10桁以上の数字も弾く。
- いっしょに遊んだ人 (play_mates、参加確定時に自動で記録) と、その人の募集の通知 (follows → 通知 followed_posted)。マイページとユーザーページにベル。
- プッシュ通知 (Web Push): Server Action の after() で、まだ送っていない通知 (notifications.pushed_at が null) を送る。VAPID 鍵はサーバーが初回に自動で作り public.server_secrets に保存。iPhone はホーム画面に追加したときだけ受け取れる。Android の Chrome はホーム画面に追加しなくても受け取れる。(service_role キーは v7 で運営者が入れ直し、動作を確認済み)
- 未登録のマイページはプロフィール作成が主 (ログインは見出しの下の小さな入口)。下部タブは全画面に表示。自己紹介は100文字。連絡先を追加 → 連絡先の欄へ移動。Xで共有はスマホでは端末の共有シート (X アプリに文と URL が入る)。
- 規約・ポリシーは硬めの文に。年齢の注意は同意欄から外して規約の「利用者の制限」へ。フッターはスマホで縦並び。
- 管理者: Discord のアカウント (a785dedf…) は admin のまま。運営者が別の匿名アカウントで見ていたのが原因。
- 試験用アカウント (テストA / テストB / 計測テスト) は運営者の了承で残す。検証に使ってよい。

## 2026-10-05 午後 (v7)
- ランクは1つずつ (DB の rank_band / min_rank = f e d c b a s1〜s9、S9 が上限)。選ぶ画面は「S1以上 / A以下」を押してからドロップダウン (`RankPicker`)。募集条件は「指定なし」もあり、表示は「S5↑」。前からいる人は帯の一番下に仮置きし rank_confirmed = false → 次に開いたとき `RankConfirmSheet` で1回だけ選び直し (migration 11、本番適用済み)。
- 目的に「チャレンジバトル」(challenge、3人まで、刻印は★) をカスタムの後ろに追加。
- service_role キーの貼り直しは、秘密鍵の入力にあたるため Claude は行わない。運営者に手順を伝えた。

## 2026-10-05 夜 (v8)
- 文言: 画面の文をすべて敬語・自然な日本語に書き直し (運営者の最優先の要望)。別エージェントの審査を1周して反映。用語は「一緒」「取り消す」「募集する」「URLは使えません」に統一。他の利用者は文中では「方」。古いマイグレーションのくだけた例外文は `src/lib/db-error.ts` の REWORD で言い換えている。
- ランクは登録で聞かない。初めて募集・参加するときに `RankSheet` (`useEnsureRank`) で聞く。DB でも rank_band が null の人は募集・参加できない (migration 12)。
- いっしょに遊んだ人の募集通知: 参加確定で自動的に follows に入る (ベルで止めた人は戻さない)。既存の play_mates も埋めた。本番で通知が届くことを確認済み。
- 通知は1件ずつ・まとめて削除できる。ブロックしている方が自分の募集や参加中の募集に入ると通知 (blocked_joined)。その方がいる募集は一覧と詳細で警告し、参加前に確認を出す。参加確定後も「参加を取り消す」で抜けられる。
- ログイン画面を廃止。引き継ぎコードのみ。引き継ぎ画面の下に運営者用 Discord ログイン。マイページのユーザーID表示と、旧方式の16桁コードの作り直しも外した。
- 保存期間を約1/4に (チャット90分・募集15日・通知7日)。profiles.last_seen_at を記録し、60日使われていないアカウントを定期処理で削除。管理画面の容量タブに日本語の表名、未使用アカウント一覧、今すぐ削除。通報・フィードバックは管理画面から削除できる。
- フッターに運営者の応援コード C-KtAo (コピーボタン付き)。
- 本番確認 (scripts/e2e-live/v8-check.mjs): 一般ユーザーは /admin で中身が出ず (loading.tsx があるので HTTP は 200 のまま「ページが見つかりません」に置き換わる)、管理用 RPC は 403「管理者のみ操作できます」。
- 不具合修正: ランク登録済みの人が「募集する」を押しても送信されなかった (submit イベント中の requestSubmit がブラウザに無視される)。setTimeout で次の周回に送るよう修正。
- この作業環境 (クラウド) からは Supabase Realtime の WebSocket が 500 になるが、プロキシのせい。実ブラウザでは接続できることを確認済み。

## 2026-10-05 深夜 (v9)
- 登録のシート: 募集・参加の途中で開くと見出しが「募集を出す前に / あなたのプロフィール」、ボタンが「登録して募集する」。ランクもこのシートで聞く (続けてランクのシートは出さない。`RankProvider` は ref で状態を持つ)。マイページの登録はランクなし。
- 満員になったら募集者と参加者に通知 (filled「メンバーがそろいました」)。
- 最終利用 (profiles.last_seen_at) は「操作した時刻」: 募集・参加・チャット・フォロー・ブロック・通報・フィードバック・通知の既読/削除・プッシュ登録・プロフィール変更 (DB のトリガー) と、引き継ぎコードの作成・引き継ぎ (persistSessionAction)。ページを見ただけでは更新しない。60日操作がなければ削除。規約・ポリシーにも書いた。
- 部屋番号は4桁の数字だけ (DB の制約は NOT VALID なので、前からある別の形の番号は残る)。
- 運営者の Discord アカウント (a785dedf-d035-424b-ae1c-16c9f61d37d1) は private.protected_users に入れ、auth.users / profiles の BEFORE DELETE トリガーでその行だけ削除を止める。BAN・削除の RPC も拒否。自動削除の対象からも外す。**この保護は外さないこと (運営者の絶対の指定)。**
- 利用停止 (suspend) は廃止し、BAN と削除に整理。BAN された人はどのページでも BAN の画面になり (規約・ポリシーは見られる)、異議申し立て (feedback.page = 'appeal') を送れる。管理画面のフィードバックで印付きで見える。
- 管理画面: 通報の「〜を確認」「〜をBAN」は対象に合わせた呼び方 (このユーザー / 募集者 / 発言者)。操作の結果の文は3秒で消える。
- 募集の集計: 募集を消すとき (自動・手動・アカウント削除のどれでも) トリガーで public.recruitment_stats_daily に日ごとの件数 (目的・遊び方・結果・流入元) を足す。管理画面の「募集」で期間を選んで集計、期間の募集ログ削除 (集計は残す / 集計も消す)。
- メンテナンス: public.site_maintenance (手動 ON と、開始・終了の予定、画面に出す文)。管理画面の「メンテナンス・お知らせ」で設定。期間中は管理者以外にメンテナンスの画面 (/transfer・/auth・規約・ポリシーは開ける)。DB でも require_active_user が管理者以外の書き込みを止める。予定があると全ページの上に帯。レイアウトはクライアント遷移で再描画されないので、開いたままの人は次の読み込みで切り替わる (書き込みは DB で止まる)。
- お知らせ配信: 全員の通知欄に announcement (本文つき) を入れ、プッシュは0件になるまで繰り返し送る。
- 本番で確認: v8-check (満員の通知・ランク表示の不具合の再発なし・管理画面の保護)、run.mjs、BAN の画面と異議申し立て (テスト用アカウントを作って SQL で BAN → 確認 → 削除)。メンテナンスは利用者に影響するので本番では切り替えていない (ローカルの DB テストと開発用プレビューで確認)。

## 2026-10-06 (v10)
- ランク: A以下は1つにまとめた (DB の値 a、表示「A以下」、席では「A↓」)。f〜b は a に移した。募集のランク条件は S1〜S9 だけ (前の A 以下の条件は「指定なし」に)。ランク条件は目安で、DB では参加を止めていない。
- 一緒に遊んだ人: 削除・BAN・通報で非表示の方は出さない (管理者は RLS で全員見えるので画面側でも除く)。
- 説明文を足した (最小限): 引き継ぐ画面の冒頭、マイページの「別の端末でも使う」「一緒に遊んだ人」、部屋番号 (募集者向け)、ランク条件「目安として表示」。
- チャットの規制: 漢数字の電話番号、チャットだけ @ID と「英字と数字が混ざった6文字以上」(private.contains_contact / containsContact)、直近3分の自分の発言 (4件) をつなげて再検査、禁止語を追加 (誤判定が多い「えろ」「しんで」「ちね」は入れない)。ブロックしている方の発言はチャットで中身を出さない。規約にも追記。
- 管理画面の通報: 「通報された人」(名前・確認リンク) と、通報ごとの「通報した人」(名前・確認リンク)・理由・日時。BAN は「通報された人をBAN」。
- migration 14 (本番適用済み)。

## 2026-10-06 昼 (v11)
- ランク条件より下の方は参加できない (DB: check_rank_on_join で private.rank_value を比べる。画面: ランクが分かっていれば最初から「S5↑の募集です」で押せない。参加前のランク入力で下だったらエラー)。承認待ちの承認では見ない。
- アイコン: profiles.avatar (cat / rabbit / bear / ghost / star、null はロールか模様)。`src/components/Avatar.tsx` に自前の線画。プロフィール編集の一番上で選ぶと即保存 (set_my_avatar)。
- 開始時刻: 時はドロップダウン、分は4つのボタン (横スクロールをやめた)。
- VC: 「あり」は募集者に Discord のユーザー名を必須で入れてもらい連絡先に保存。参加者も VC ありの募集では `DiscordSheet` で聞く (set_my_discord)。「どちらでも / なし」はチャットでやり取りする旨を一行。
- 文言: 「引き継ぐ」→「ログイン」(ヘッダー・画面名・ボタン・シート)、運営者用の見出しは削除、「プロフィールを作成」「以前から使っていた方」「ユーザー名 (他のユーザーに表示される名前です)」。
- 起動時: ルートのレイアウトで children を Suspense で包み、待機画面 (`BootSplash`、くるくる) を出す。html/body に紙色を直接指定。
- 応援コードの箱を約7割の大きさに。カードの申請後の表示は「承認待ち」。
- シートの中の「ログイン」で移動したらシートを閉じる (OnboardingProvider が pathname の変化で閉じる)。
- 説明: ブロック (ユーザーページ)、通知 (マイページ) に一行ずつ。
- 人数の見せ方: 「2/3」+ 朱の「あと1人」(カードと詳細)。名前の見えない参加者の席は網掛けをやめ、濃い色に人のアイコン。
- migration 15 (本番適用済み)。

## 2026-10-06 夕 (v12)
- サイト名を「JOIN◆COMPASS」に (ロゴは `Wordmark`、文中は「JOIN COMPASS」、タブのタイトルは「JOIN◆COMPASS」)。
- 管理画面: ユーザー一覧は admin_list_users (10件ずつ・総数・匿名/引き継ぎ・管理者・最終操作)。前は profiles を直接読んでいて、列権限のない last_seen_at を選んだせいで一覧が空だった。募集一覧も10件ずつ。
- マイページ: 「お気に入り」(ベルをオンにした方) を新設。「一緒に遊んだ人」は新しい10人 (定期処理で11人目以降の記録を消す)。ベルの状態は follows.active を見るよう修正 (前はオフにした人もオン表示だった)。
- 容量: 管理画面の容量は10秒ごとに読み直す (admin_db_size)。「容量を詰める」は pg_cron に VACUUM FULL を予約し (admin_compact、ジョブ名 admin-compact)、成功したら定期処理が予約を外す。DB は 14MB 程度で、その大半は Supabase の仕組みの分。
- migration 16 (本番適用済み)。

## 2026-10-08 (v13 点検の修正)
- 点検の結果は Claude Doc「JOIN COMPASS 総点検と対策案」(スレッド「機能の洗い出しと確認」)。
- フォント: Zen Kaku Gothic New を preload: false に。前は初回に315ファイル・約3MBを先読みしていた (スマホ幅で読み込み完了まで約10秒)。見た目は同じ。
- 通報: 通報した時点の対象の文と持ち主を reports.target_snapshot / target_owner_id に写す (トリガー)。発言が90分で消えても管理画面に中身と送り主が出て BAN できる。プライバシーポリシーに追記。migration 17 (**本番は未適用。push の前に SQL Editor で流すこと**)。
- 共有カード: サイト全体と募集ごとの opengraph-image (募集は目的・開始・あと何人)。日本語は Google Fonts から使う字だけ取る (`src/lib/og.tsx`)。募集の詳細は noindex、robots.txt と sitemap.xml を追加。
- アイコン: apple-icon.png (iPhone のホーム画面)、icon-192/512.png、通知用の badge.png (単色)。
- 募集詳細の自動更新: 15秒ごとに Supabase へ小さな問い合わせ (人数・状態・見える参加の行・部屋番号・最新の発言) だけを送り、変わったときだけ router.refresh (Vercel の関数の回数を抑える)。
- 毎日の DB バックアップ: `.github/workflows/db-backup.yml`。GitHub の Secrets に SUPABASE_DB_URL (運営者が入れる) があれば動き、Artifacts に7日。
- VC ありの Discord 必須は運営者の指定 (v11) のまま。

## 2026-10-09 夜 (アクセス集中の緊急対策)
- アクセス集中で Supabase の DB が応答しなくなった (Vercel と Supabase 全体は正常、このプロジェクトの Postgres が詰まった)。
- 未ログインの方の読み込みを全員で共有する: 一覧は 15秒 (listRecruitmentsPublic)、募集詳細と共有カード画像は 10秒 (getRecruitmentPublic)、メンテナンス状態は全員 30秒 (site-status.ts)。`unstable_cache` + Cookie を使わない `src/lib/supabase/public.ts`。ログインしている方はブロックの見え方があるので今までどおり。
- 募集詳細の自動確認は、失敗したときに描き直さない (前は失敗のたびに router.refresh して負荷を足していた)。失敗が続くと間隔を最大2分まで空ける。
- 続き: 自動確認は参加者・募集者が20秒、それ以外は45秒 (未ログインは参加の行を読まない)。放置で60秒→180秒。
- migration 19 (RLS の auth.uid() / is_admin を (select ...) で包む。見え方は同じで、1行ごとの計算を1回に)。**本番は未適用。SQL Editor で流すこと** (17・18 と独立。どの順でもよい)。

- フォント (運営者の承認): 本文 (400・500) は端末の標準フォント (ヒラギノ / Noto)、Zen Kaku は太字・極太 (700・900) だけ。`.font-bold` などと、@apply で太字を使う部品は `font-strong` で Zen Kaku。1ページの日本語フォントは約47ファイル・536KB → 31ファイル・383KB (開発用プレビューで計測)。
- 続き2 (原因調査): データは募集75件・14MB 程度なのに、混雑時は75行を読むのに60秒かかり、DB を使わない Auth のヘルスチェックも止まった。クエリではなく無料枠の Nano (共有CPU・0.5GB・ディスク基準 5MB/s) そのものが足りていない。有料にするなら Pro + Small (月$30) が目安 (運営者の判断待ち)。
- 続き2 (対策): ヘッダー用の4回の読み込みを1回の RPC (viewer_header) に。関数がない間は前のやり方に戻る。参加していない方の自動確認は /api/live/[id] (CDN に10秒、proxy の対象外) を読む。「容量を詰める」(VACUUM FULL、全テーブルが止まる) を廃止。容量表示の読み直しは1分ごと。migration 20 (notifications を Realtime の対象から外す・admin_compact を止める・viewer_header)。**本番は未適用。SQL Editor で流すこと** (19 と独立)。

## 次にやること (候補)
- 審査の残り: PC 詳細の右列の下が空く。通知がブロックされたときの案内。
- 実機 (iPhone Safari) で文字の折り返しを見る。

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
