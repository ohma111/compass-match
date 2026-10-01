// 募集作成(タップ式)のロジック。クライアントとサーバーの両方で使う。
// 時刻はすべてJSTで考え、UTCのDateで返す。
import { DEFAULT_DURATION_MIN, LIMITS, PURPOSE_LABELS, RANK_MIN_LABELS, type Purpose, type RankBand } from './constants';
import { formatJstTime, jstAt, jstParts } from './time';

export const START_KEYS = ['now', 'in30', 'h21', 'h22', 'h23', 'custom'] as const;
export type StartKey = (typeof START_KEYS)[number];

const FIXED: Partial<Record<StartKey, number>> = { h21: 21, h22: 22, h23: 23 };
const GRACE_MS = LIMITS.startGraceMin * 60_000;

export interface StartChip {
  key: StartKey;
  label: string;
  at: Date;
}

function floorMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

function ceil5(ms: number): number {
  const step = 5 * 60_000;
  return Math.ceil(ms / step) * step;
}

/** 固定時刻チップ(21:00など)の今日(JST)の時刻 */
function fixedAt(key: StartKey, now: Date): Date | null {
  const h = FIXED[key];
  return h === undefined ? null : jstAt(h, 0, 0, now);
}

/**
 * 表示するチップ(「その他」を除く)。
 * 過ぎた固定時刻は翌日扱いにせず非表示にする。
 */
export function startChips(now: Date = new Date()): StartChip[] {
  const chips: StartChip[] = [
    { key: 'now', label: '今すぐ', at: new Date(floorMinute(now.getTime())) },
    { key: 'in30', label: '30分後', at: new Date(ceil5(now.getTime() + 30 * 60_000)) },
  ];
  for (const key of ['h21', 'h22', 'h23'] as const) {
    const at = fixedAt(key, now)!;
    if (at.getTime() > now.getTime()) chips.push({ key, label: formatJstTime(at), at });
  }
  return chips;
}

/** "HH:MM" を検証して [時, 分] を返す */
export function parseHm(value: string | null | undefined): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return [h, mi];
}

/**
 * 「その他」で選んだ時刻。今日(JST)のその時刻が30分以上前なら翌日とみなす
 * (深夜0時台の募集を22時ごろに出すケースのため)。
 */
export function customStartAt(hm: string | null | undefined, now: Date = new Date()): Date | null {
  const parsed = parseHm(hm);
  if (!parsed) return null;
  const today = jstAt(parsed[0], parsed[1], 0, now);
  if (today.getTime() < now.getTime() - GRACE_MS) return jstAt(parsed[0], parsed[1], 1, now);
  return today;
}

/**
 * 送信されたチップを開始時刻に変換する(サーバー側で now を基準に再計算)。
 * 固定時刻がすでに30分以上前なら null (画面を開いたまま時間が過ぎた場合)。
 */
export function resolveStart(key: StartKey, customHm: string | null | undefined, now: Date = new Date()): Date | null {
  if (key === 'custom') return customStartAt(customHm, now);
  if (key === 'now') return new Date(floorMinute(now.getTime()));
  if (key === 'in30') return new Date(ceil5(now.getTime() + 30 * 60_000));
  const at = fixedAt(key, now);
  if (!at || at.getTime() < now.getTime() - GRACE_MS) return null;
  return at;
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
