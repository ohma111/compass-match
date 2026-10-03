// DBエラーを利用者向けの日本語メッセージへ変換する。
// RPC内で raise した例外はすでに日本語なのでそのまま返す。
// それ以外(制約違反など)は詳細を出さず一般的な文言にする (内部情報を漏らさない)。
export interface PgLikeError {
  code?: string;
  message?: string;
}

const JAPANESE = /[぀-ヿ一-龯]/;

export function toUserMessage(err: PgLikeError | null | undefined): string {
  if (!err) return 'うまくいきませんでした。もう一度押してください';
  const code = err.code ?? '';
  const msg = err.message ?? '';
  if (['P0001', 'P0002', 'P0429', '22023', '28000', '42501'].includes(code) && JAPANESE.test(msg)) return msg;
  if (code === '23514') return '入力内容に使用できない値が含まれています (URLは入力できません)';
  if (code === '23505') return 'すでに登録されています';
  if (code === '42501') return 'この操作を行う権限がありません';
  if (code === 'PGRST301' || code === '28000') return 'ログインが必要です';
  return 'うまくいきませんでした。もう一度押してください';
}
