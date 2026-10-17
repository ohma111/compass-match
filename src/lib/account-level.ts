// 垢レベル (自己申告)。1〜999。参加の条件には使わない。

export const ACCOUNT_LEVEL_MAX = 999;

/** 入力欄の文字列を数字に直す。空は null (消す)、範囲外・数字以外は undefined */
export function parseAccountLevel(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (s === '') return null;
  if (!/^\d{1,3}$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 1 && n <= ACCOUNT_LEVEL_MAX ? n : undefined;
}

/** 「今日に更新」「3日前に更新」「2か月前に更新」 */
export function updatedAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return '今日更新';
  if (days < 30) return `${days}日前に更新`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}か月前に更新` : `${Math.floor(months / 12)}年前に更新`;
}
