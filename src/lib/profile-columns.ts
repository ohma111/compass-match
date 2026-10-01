// profiles を読むときに使う列の一覧 (アプリ全体でここだけを参照する)。
// authenticated に付与している列権限 (supabase/migrations/20260930000003_rls.sql) の範囲内であること。
// signup_src などの非公開列を足すと PostgREST が権限エラーを返すので、select('*') は使わない。
// この定数は tests/profile-columns.test.ts と npm run db:verify (SQLテスト) からも参照している。
// 依存のない純粋な TS に保つこと (db-verify.sh が node で直接読み込む)。

export const PROFILE_COLUMNS = [
  'id',
  'display_name',
  'rank_band',
  'play_roles',
  'characters',
  'purposes',
  'vc',
  'tags',
  'bio',
  'hidden_at',
  'suspended_at',
  'banned_at',
  'created_at',
  // v3 (20261001000006_v3.sql): ランク帯を本人がもう選んだか
  'rank_confirmed',
] as const;

export const PROFILE_SELECT = PROFILE_COLUMNS.join(', ');
