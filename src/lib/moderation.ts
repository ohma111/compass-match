// 通報による自動非表示の判定。DB側 public.submit_report() と同じロジック。
export const DEFAULT_AUTO_HIDE_THRESHOLD = 3;

export interface ReportLike {
  reporterId: string;
  resolved?: boolean;
}

/** 未処理の通報について、異なる通報者の数を数える (対象の持ち主本人の通報は除外) */
export function distinctReporterCount(reports: ReportLike[], targetOwnerId?: string | null): number {
  const set = new Set<string>();
  for (const r of reports) {
    if (r.resolved) continue;
    if (targetOwnerId && r.reporterId === targetOwnerId) continue;
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
