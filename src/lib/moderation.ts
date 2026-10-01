// 通報による自動非表示の判定。DB側 public.submit_report() と同じロジック。
export const DEFAULT_AUTO_HIDE_THRESHOLD = 3;

/** 作成からこの時間が経っていないアカウントの通報は、自動非表示の人数に数えない (v3) */
export const REPORTER_MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReportLike {
  reporterId: string;
  resolved?: boolean;
  /** 通報した時刻。reporterCreatedAt と両方あるときだけアカウント年齢を判定する */
  reportedAt?: Date | string;
  /** 通報者のアカウント(プロフィール)作成時刻 */
  reporterCreatedAt?: Date | string;
}

/** 通報した時点で、通報者のアカウントが作成から24時間以上経っていたか */
export function isCountableReporter(r: ReportLike): boolean {
  if (r.reportedAt === undefined || r.reporterCreatedAt === undefined) return true;
  return new Date(r.reportedAt).getTime() - new Date(r.reporterCreatedAt).getTime() >= REPORTER_MIN_ACCOUNT_AGE_MS;
}

/** 未処理の通報について、異なる通報者の数を数える (対象の持ち主本人・作成24時間未満のアカウントの通報は除外) */
export function distinctReporterCount(reports: ReportLike[], targetOwnerId?: string | null): number {
  const set = new Set<string>();
  for (const r of reports) {
    if (r.resolved) continue;
    if (targetOwnerId && r.reporterId === targetOwnerId) continue;
    if (!isCountableReporter(r)) continue;
    set.add(r.reporterId);
  }
  return set.size;
}

export function shouldAutoHide(
  reports: ReportLike[],
  targetOwnerId?: string | null,
  threshold: number = DEFAULT_AUTO_HIDE_THRESHOLD,
): boolean {
  if (!Number.isFinite(threshold) || threshold < 1) threshold = DEFAULT_AUTO_HIDE_THRESHOLD;
  return distinctReporterCount(reports, targetOwnerId) >= threshold;
}
