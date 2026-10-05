// 募集作成(タップ式)のロジック。クライアントとサーバーの両方で使う。
// 時刻はすべてJSTで考え、UTCのDateで返す。
import { DEFAULT_DURATION_MIN, LIMITS, PURPOSE_LABELS, RANK_MIN_LABELS, type Purpose, type RankBand } from './constants';
import { formatJstTime, jstAt, jstParts } from './time';

/** 開始時刻: 「今すぐ」か、今日/明日の15分刻みの枠 */
export const START_KEYS = ['now', 'slot'] as const;
export type StartKey = (typeof START_KEYS)[number];
export const START_DAYS = ['today', 'tomorrow'] as const;
export type StartDay = (typeof START_DAYS)[number];
export const SLOT_MINUTES = [0, 15, 30, 45] as const;

const GRACE_MS = LIMITS.startGraceMin * 60_000;

function floorMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

/** "HH:MM" を検証して [時, 分] を返す (分は15分刻みだけ) */
export function parseHm(value: string | null | undefined): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || !(SLOT_MINUTES as readonly number[]).includes(mi)) return null;
  return [h, mi];
}

/** 今日/明日のその枠の時刻 (JST)。今日のすでに30分以上前の枠は null */
export function slotAt(day: StartDay, hm: string | null | undefined, now: Date = new Date()): Date | null {
  const p = parseHm(hm);
  if (!p) return null;
  const at = jstAt(p[0], p[1], day === 'tomorrow' ? 1 : 0, now);
  if (at.getTime() < now.getTime() - GRACE_MS) return null;
  return at;
}

/** 今から選べる、いちばん近い15分枠 ("HH:MM" と、それが今日か明日か) */
export function nextSlot(now: Date = new Date()): { day: StartDay; hm: string } {
  const step = 15 * 60_000;
  const t = new Date(Math.ceil((now.getTime() + 60_000) / step) * step);
  const p = jstParts(t);
  const n = jstParts(now);
  const day: StartDay = p.day === n.day ? 'today' : 'tomorrow';
  return { day, hm: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` };
}

/** その日の、選べる時 (今日は今の時から、明日は0〜23時) */
export function selectableHours(day: StartDay, now: Date = new Date()): number[] {
  if (day === 'tomorrow') return Array.from({ length: 24 }, (_, i) => i);
  const h = jstParts(now).hour;
  return Array.from({ length: 24 - h }, (_, i) => h + i);
}

/** 送信された開始の指定を時刻に変換する (サーバー側で now を基準に計算し直す) */
export function resolveStart(
  key: StartKey,
  day: StartDay | null | undefined,
  hm: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (key === 'now') return new Date(floorMinute(now.getTime()));
  return slotAt(day ?? 'today', hm, now);
}

/** 終了時刻は開始 + 1時間で自動設定 */
export function autoEnd(start: Date): Date {
  return new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
}

/**
 * ひとことが空のときのタイトル。例: 「ランク S4〜の募集」
 * 残りの人数は入れない (参加者が増えると「あと1人」のまま満員になり、表示と食い違うため)。
 */
export function autoTitle(args: { purpose: Purpose; minRank: RankBand | null; capacity?: number }): string {
  const head = args.minRank ? `${PURPOSE_LABELS[args.purpose]} ${RANK_MIN_LABELS[args.minRank]}` : PURPOSE_LABELS[args.purpose];
  return `${head}の募集`;
}

/** 開始時刻のプレビュー表示。例: 「今日 21:35」「明日 01:00」 */
export function startPreview(at: Date, now: Date = new Date()): string {
  const a = jstParts(at);
  const n = jstParts(now);
  const t = jstParts(jstAt(0, 0, 1, now));
  const day =
    a.year === n.year && a.month === n.month && a.day === n.day
      ? '今日'
      : a.year === t.year && a.month === t.month && a.day === t.day
        ? '明日'
        : `${a.month}/${a.day}`;
  return `${day} ${formatJstTime(at)}`;
}
