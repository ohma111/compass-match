// 時刻ヘルパー。保存はUTC(ISO文字列/timestamptz)、表示はJST(UTC+9、サマータイムなし)。
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

/** JSTの年月日時分を返す (Dateのローカルタイムゾーンに依存しない) */
export function jstParts(d: Date | string) {
  const shifted = new Date(toDate(d).getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 例: 9/30(水) 21:00 */
export function formatJst(d: Date | string): string {
  const p = jstParts(d);
  return `${p.month}/${p.day}(${WEEKDAYS[p.weekday]}) ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 例: 21:00 */
export function formatJstTime(d: Date | string): string {
  const p = jstParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 例: 9/30(水) 21:00〜23:00 (日付をまたぐ場合は終了側にも日付) */
export function formatJstRange(start: Date | string, end: Date | string): string {
  const s = jstParts(start);
  const e = jstParts(end);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  return `${formatJst(start)}〜${sameDay ? formatJstTime(end) : formatJst(end)}`;
}

/** JSTの「今日」から offsetDays 日後の 0:00〜翌0:00 をUTCのDateで返す */
export function jstDayRange(offsetDays: number, now: Date = new Date()): { start: Date; end: Date } {
  const p = jstParts(now);
  const startUtcMs = Date.UTC(p.year, p.month - 1, p.day + offsetDays) - JST_OFFSET_MS;
  return { start: new Date(startUtcMs), end: new Date(startUtcMs + 24 * 60 * 60 * 1000) };
}

/** <input type="datetime-local"> の値 (JSTとして解釈) をUTCのDateに変換。不正ならnull */
export function parseJstLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MS;
  const check = jstParts(new Date(ms));
  if (check.month !== mo || check.day !== d) return null; // 2/31 などを弾く
  return new Date(ms);
}

/** UTCのDateを <input type="datetime-local"> 用のJST文字列に変換 */
export function toJstLocalInput(d: Date | string): string {
  const p = jstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 開始時刻の相対表示 (例: 「あと25分」「開始済み」) */
export function relativeStart(start: Date | string, end: Date | string, now: Date = new Date()): string {
  const s = toDate(start).getTime();
  const e = toDate(end).getTime();
  const n = now.getTime();
  if (n >= e) return '終了';
  if (n >= s) return '開催中';
  const min = Math.round((s - n) / 60000);
  if (min < 60) return `あと${min}分`;
  const h = Math.floor(min / 60);
  if (h < 24) return `あと${h}時間`;
  return `あと${Math.floor(h / 24)}日`;
}
