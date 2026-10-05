# コンパス・マッチング

#コンパス(3対3)で、今から一緒に遊べる人を探す募集掲示板。非公式のファンサイト。

- 本番: https://compass-match.vercel.app
- 構成: Next.js 16 (App Router) + TypeScript + Tailwind / Supabase (Auth・Postgres・Realtime・RLS) / Vercel
- 引き継ぎ・現状・次にやること: `CLAUDE.md`
- 経緯(要件書・各版の作り直し・審査記録): `docs/history/`, `docs/design-review.md`

## 無料枠について
Supabase Free (DB 500MB・通信 5GB・月間アクティブ 5万人) と Vercel Hobby (関数 100万回・CPU 4時間/月) は、超えても請求されない (カード未登録)。代わりに止まる・読み取り専用になる。
- DB の量は管理画面の「容量」タブで見る。そこから古いデータの削除・60日使われていないアカウントの削除もできる。6割を超えたら `app_settings` の保存日数を短くする。
- 通信量と関数の実行回数は DB から見えない。Supabase と Vercel の Usage 画面で見る (どちらも上限が近づくとメールが来る)。
- Supabase Free は1週間アクセスがないと一時停止する (請求ではない)。
- 有料プランに上げる操作は運営者が判断する。

## 今の仕様(v8)
- 各版の変更は CLAUDE.md を参照。
- 見た目: 「タイムテーブル」。ホームは募集を開始時刻の時間割として並べ、「いま」の線と日付の帯を入れる。席は「ロール + ランク」、ロール未登録は模様。

- 見るだけならログイン不要。初めて「参加する」「空き席」「募集する」を押すと下からシートが出て、表示名を入れると始められる (Supabase の匿名サインイン、その端末に保存)。ランク (F〜A・S1〜S9) は登録では聞かず、初めて募集・参加するときにシートで聞く。
- 別の端末で使う人だけ、マイページで「引き継ぎコード」を作る。
- 募集: 目的・開始・人数・参加方式(早い者勝ち/承認制)をタップで選ぶ。参加が決まった人だけに部屋番号とチャット。
- 通報・ブロック・管理画面あり。作成24時間未満のアカウントの通報は自動非表示の人数に数えない。始めて10分以内の匿名アカウントはチャット10件まで。
- ログイン画面はない。別の端末へは引き継ぎコードだけ。引き継ぎ画面の下に運営者用の「Discord でログイン」(管理者アカウント)。旧方式のユーザーID+パスワードの入口は v8 で削除。
- 保存期間 (app_settings): チャットは募集終了から90分、募集は15日、通知は7日、60日使われていないアカウントは削除 (管理者・進行中の募集がある人は除く)。

## 本番の設定(済み)
| 場所 | 設定 |
| --- | --- |
| Supabase (リージョン: ソウル) | migrations 1〜12 適用済み / Allow anonymous sign-ins ON / Confirm email OFF / パスワード最小8文字 / Discord プロバイダ有効 / Site URL・Redirect URLs に本番と localhost |
| Vercel (Hobby・無料) | 環境変数 `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `NEXT_PUBLIC_SITE_URL` `NEXT_PUBLIC_FEATURE_AVAILABLE_NOW=false` `NOW_LIST_MIN_USERS=30` `SUPABASE_SERVICE_ROLE_KEY`(サーバー専用) / 関数リージョン `icn1`(ソウル、`vercel.json`) |
| GitHub | `ohma111/compass-match`(非公開)。main に push すると Vercel が自動で公開 |

## DB を変更するとき
1. `supabase/migrations/` に次の番号でファイルを1つ足す(小さく、2回流しても壊れないように)。
2. `npm run db:verify` で確認。
3. Supabase の SQL Editor に貼って実行してから、コードを push する(順番を逆にすると新しいコードが古い DB で動いて壊れる)。

## 開発
```bash
npm run dev            # 開発サーバー。/dev/preview にダミーデータの画面(本番ビルドには入らない)
npm run build          # 本番ビルド
npm test               # Vitest
npm run typecheck
npm run db:verify      # ローカル PostgreSQL 16 でマイグレーション + RLS テスト(Supabase には繋がない)
npm run preview:shots  # dev 起動中に主要画面を 375px / 1440px で撮影 → docs/screenshots
node scripts/e2e-live/run.mjs       # 本番に匿名テストアカウントを作って一連の流れを試す
node scripts/e2e-live/v8-check.mjs  # 遊んだ人の募集通知・通知の削除・一般ユーザーが管理画面/管理RPCに入れないこと
```

設定値(通報の自動非表示人数、チャット保持時間)は DB の `app_settings`。レート制限は DB 関数内。

```
src/app/            画面と Server Actions
src/components/     UI
src/lib/            検証(zod)・時刻(JST)・定員・通報判定・Supabase クライアント
src/proxy.ts        セッション更新(Safari の Cookie 期限対策込み)と ?src= の記録
supabase/migrations スキーマ・関数・RLS
supabase/tests/     db:verify 用 SQL テスト
tests/              Vitest
```
