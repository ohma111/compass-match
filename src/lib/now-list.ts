// 「今から遊べる」一覧の表示ルール。
// 人数が閾値未満のときは人数を出さず、名前だけを見せる (「0人」を見せないため)。
export function nowListView(activeCount: number, threshold: number): { showCount: boolean; countLabel: string | null } {
  if (activeCount >= threshold && threshold > 0) {
    return { showCount: true, countLabel: `いま${activeCount}人が遊べます` };
  }
  return { showCount: false, countLabel: null };
}
