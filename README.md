# コンパス遊び相手さがし (MVP)

「#コンパス」で、今この時間に一緒に遊べる人を見つけるための募集掲示板です(非公式のファンサービス)。
Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (Auth / Postgres / Realtime / RLS) で作っています。

- 仕様書: `../requirements.md`
- 実装内容・仕様との差分: `IMPLEMENTATION_NOTES.md`

---

## あなた(運営者)が手作業で行うこと

コードは完成していますが、アカウント作成・秘密情報の入力・デプロイは行っていません。以下を順番に行ってください。
**💰 マークは、お金がかかる可能性がある箇所です。** マークがない手順は無料で完了します。

### 0. 事前準備
- Node.js 20 以上をインストール
- このフォルダで `npm install` を実行

### 1. Supabase プロジェクトを作る
1. https://supabase.com でアカウントを作成し、「New project」を作成します。
   - リージョンは **Northeast Asia (Tokyo)** がおすすめです。
   - Database Password は安全な場所に保管してください(コードやチャットに貼らないこと)。
   - **Free プランで作成してください。** 💰 Pro プラン(月額 $25〜)にする必要は MVP ではありません。
   - 注意: Free プランは **7日間アクセスがないとプロジェクトが一時停止** します(ダッシュボードから再開可能)。公開中は毎日使われる想定なので通常は問題ありません。
2. 作成後、Project Settings → API で次の2つを控えます。
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon (public) キー、または Publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - ⚠️ `service_role` / Secret キーはこのアプリでは使いません。どこにも設定しないでください。

### 2. データベースにマイグレーションを適用する
次のどちらかの方法で、`supabase/migrations/` の SQL を **ファイル名の順番どおりに** 実行します。

- **方法A: ダッシュボードで実行(簡単)**
  Supabase ダッシュボード → SQL Editor で、以下の4ファイルの中身を1つずつ貼り付けて「Run」します。
  1. `20260930000001_schema.sql`
  2. `20260930000002_functions.sql`
  3. `20260930000003_rls.sql`
  4. `20260930000004_settings_and_cron.sql`
- **方法B: Supabase CLI**
  ```bash
  npx supabase login
  npx supabase link --project-ref <あなたのproject-ref>
  npx supabase db push
  ```

補足:
- 4番目のファイルは `pg_cron` 拡張を有効にし、5分ごとのメンテナンス(募集の自動終了、終了6時間後のチャット削除、期限切れ「今から遊べる」の削除)を登録します。うまく登録されない場合は、Database → Extensions で `pg_cron` を有効化してから4番目のファイルを再実行してください。
- `supabase/seed.sql` は **ローカル開発用のダミーデータ** です。本番には実行しないでください。
- Realtime: マイグレーションで `messages` と `notifications` を Realtime に登録しています。Database → Publications → `supabase_realtime` に2つのテーブルが入っていることを確認してください。

### 3. Discord ログインを設定する(無料)
1. https://discord.com/developers/applications で「New Application」を作成します。
2. OAuth2 → Redirects に次を追加します。
   `https://<あなたのproject-ref>.supabase.co/auth/v1/callback`
3. OAuth2 画面の **Client ID** と **Client Secret** を控えます。
4. Supabase ダッシュボード → Authentication → Sign In / Providers → **Discord** を有効化し、Client ID と Client Secret を貼り付けて保存します。

### 4. X(Twitter) ログインを設定する
1. https://developer.x.com でデベロッパーアカウントを作成し、Project と App を作成します。
   - 💰 **X API は Free プランで作成してください。** ログイン(OAuth 2.0)用途だけなら有料プラン(Basic 等)は不要な想定ですが、X の料金体系は頻繁に変わるため、登録時に「ログインだけなら無料で使えるか」を必ず確認してください。有料が必要と表示された場合は X ログインをあとまわしにし、Discord ログインだけで公開できます(X ボタンは押してもエラー画面になるだけです)。
2. App の「User authentication settings」で次を設定します。
   - App permissions: **Read**
   - Type of App: **Web App**
   - Callback URI: `https://<あなたのproject-ref>.supabase.co/auth/v1/callback`
   - Website URL: 公開するサイトのURL
3. **OAuth 2.0 の Client ID と Client Secret** を控えます。
4. Supabase ダッシュボード → Authentication → Sign In / Providers → **X / Twitter (OAuth 2.0)** を有効化し、Client ID と Client Secret を貼り付けて保存します。
   (古い「Twitter (OAuth 1.0a)」ではなく、OAuth 2.0 の方です。コードは `x` プロバイダを使います)

### 5. Supabase の URL 設定
Authentication → URL Configuration で次を設定します。
- Site URL: 本番URL(例: `https://your-app.vercel.app`)
- Redirect URLs に次を追加:
  - `https://your-app.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`(ローカル確認用)

### 6. 環境変数を設定してローカルで確認する
```bash
cp .env.example .env.local
# .env.local を開き、手順1で控えた値を入れる
npm run dev
```
http://localhost:3000 を開いて、ログイン → プロフィール作成 → 募集作成 ができれば OK です。

| 変数名 | 内容 | 例 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL | `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable キー | (ダッシュボードの値) |
| `NEXT_PUBLIC_SITE_URL` | 公開URL(末尾スラッシュなし) | `https://your-app.vercel.app` |
| `NEXT_PUBLIC_FEATURE_AVAILABLE_NOW` | 「今から遊べる」機能。**初期は `false`** | `false` |
| `NOW_LIST_MIN_USERS` | 「今から遊べる」で人数を出す閾値 | `30` |

### 7. Vercel にデプロイする
1. このフォルダを GitHub の(できれば **Private**)リポジトリに push します。`.env.local` は `.gitignore` 済みなので push されません。
2. https://vercel.com で GitHub 連携してリポジトリを Import します。
   - 💰 **Hobby(無料)プランで作成してください。** 注意: Vercel の Hobby プランは **非商用利用のみ** です。将来、課金機能や広告を入れる場合は Pro プラン(月額 $20〜)への切り替えが必要になります。
3. Settings → Environment Variables に、手順6の表の5つを登録します(`NEXT_PUBLIC_SITE_URL` は Vercel の本番URL)。
4. Deploy します。デプロイ後のURLを手順5の Site URL / Redirect URLs と、X の Website URL に反映してください。
   - 💰 独自ドメインを使う場合はドメイン代がかかります(Vercel の `*.vercel.app` のままなら無料)。

### 8. 自分を管理者にする
1. 本番サイトで一度ログインし、プロフィールを作成します。
2. Supabase ダッシュボード → Authentication → Users で自分のユーザーの **UID** をコピーします。
3. SQL Editor で次を実行します(`<UID>` を置き換える)。
   ```sql
   insert into public.user_roles (user_id, role) values ('<UID>', 'admin');
   ```
4. サイトを再読み込みすると、フッターに「管理画面」リンクが出ます。

### 9. 公開前チェック
- [ ] `/terms`(利用規約)と `/privacy`(プライバシーポリシー)は **雛形** です。自分で読んで修正してください(`src/app/terms/page.tsx`, `src/app/privacy/page.tsx`)。修正後、ページ上部の「雛形です」の赤い注意書きを消してください。
- [ ] 規約の内容を大きく変えたら `src/lib/constants.ts` の `TERMS_VERSION` を更新してください。
- [ ] 告知リンクには流入元を付けてください: ギルド内向け `https://your-app.vercel.app/?src=guild`、X向け `?src=x`、YouTube向け `?src=yt` など(英小文字・数字・`_`・`-`、32文字まで)。管理画面の「指標」タブで、`guild` 以外から承認された参加を「ギルド外の参加」として数えられます。

### 10. 「今から遊べる」を有効にしたくなったら
Vercel の環境変数 `NEXT_PUBLIC_FEATURE_AVAILABLE_NOW` を `true` にして **再デプロイ**(`NEXT_PUBLIC_` の値はビルド時に埋め込まれるため)。

---

## 開発者向け

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド (Supabase 環境変数なしでも成功する)
npm test           # Vitest (検証・URLブロック・通報の自動非表示・JST・定員ロジック)
npm run typecheck  # 型チェック
npm run db:verify  # ローカルの PostgreSQL 16 でマイグレーション + RLS テストを実行 (Supabaseには接続しない)
```

- `npm run db:verify` には PostgreSQL 16 以上のサーバーバイナリ(`initdb`, `pg_ctl`, `psql`)が必要です。`PGBIN=/usr/lib/postgresql/16/bin` のように場所を指定できます。Supabase の `auth` スキーマ等は `supabase/tests/00_supabase_shim.sql` で最小限を再現しています。
- ローカルで Supabase 一式を動かしたい場合は Docker と `npx supabase start` を使います(`supabase/seed.sql` が投入されます)。

### 設定値
| 値 | 場所 | 初期値 |
| --- | --- | --- |
| 通報で自動非表示にする人数 | DB `app_settings.report_auto_hide_threshold` | 3 |
| チャット保持時間(募集終了後) | DB `app_settings.chat_retention_hours` | 6 |
| レート制限 | DB 関数内(`20260930000002_functions.sql`)。`src/lib/constants.ts` の `RATE_LIMITS` は表示・ドキュメント用 | 募集 3件/時・同時3件、申請 10件/10分、チャット 2秒に1件かつ30秒に5件、通報 10件/日 |

DB の設定値は SQL Editor で変更できます:
```sql
update public.app_settings set value = '5' where key = 'report_auto_hide_threshold';
```

### ディレクトリ
```
src/app/            画面 (App Router) と Server Actions (src/app/actions)
src/lib/            検証(zod)・時刻(JST)・定員・通報判定・Supabaseクライアント
src/proxy.ts        セッション更新と ?src= の Cookie 保存 (Next.js 16 の Proxy = 旧 Middleware)
supabase/migrations スキーマ・関数・RLS・設定/定期ジョブ
supabase/seed.sql   ローカル開発用ダミーデータ
supabase/tests/     ローカル検証用 SQL テスト
tests/              Vitest
```
