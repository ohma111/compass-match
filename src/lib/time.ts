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

/** JSTの「今日 + offsetDays」の hour:minute をUTCのDateで返す */
export function jstAt(hour: number, minute: number, offsetDays: number, now: Date = new Date()): Date {
  const { start } = jstDayRange(offsetDays, now);
  return new Date(start.getTime() + (hour * 60 + minute) * 60_000);
}

/** 同じJST日付か */
export function isSameJstDay(a: Date | string, b: Date | string): boolean {
  const x = jstParts(a);
  const y = jstParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * 募集カードのカウントダウン表示。
 * 開催中 → 「開催中」、60分以内 → 「あと12分」、今日 → 「22:00〜」、明日 → 「明日 22:00〜」、それ以降 → 「10/3 22:00〜」
 */
export function countdownLabel(start: Date | string, end: Date | string, now: Date = new Date()): string {
  const s = toDate(start).getTime();
  const e = toDate(end).getTime();
  const n = now.getTime();
  if (n >= e) return '終了';
  if (n >= s) return '開催中';
  const min = Math.ceil((s - n) / 60000);
  if (min <= 60) return `あと${min}分`;
  const time = `${formatJstTime(start)}〜`;
  if (isSameJstDay(start, now)) return time;
  if (isSameJstDay(start, jstDayRange(1, now).start)) return `明日 ${time}`;
  const p = jstParts(start);
  return `${p.month}/${p.day} ${time}`;
}

/** カウントダウンの強調度: live=開催中, soon=30分以内, later */
export function countdownTone(start: Date | string, end: Date | string, now: Date = new Date()): 'live' | 'soon' | 'later' {
  const s = toDate(start).getTime();
  const n = now.getTime();
  if (n >= s && n < toDate(end).getTime()) return 'live';
  if (s - n <= 30 * 60_000) return 'soon';
  return 'later';
}
