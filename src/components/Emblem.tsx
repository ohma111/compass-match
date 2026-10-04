/**
 * ロールを登録していない人の席に出す模様。ユーザーIDから決まる 5×5 の左右対称の図柄で、
 * 同じ人はいつも同じ模様になる (名前の頭文字の代わり。似顔絵・キャラ画像は使わない)。
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function emblemCells(seed: string): boolean[] {
  let h = hash(seed);
  const cells: boolean[] = new Array(25).fill(false);
  // 左3列を決めて右2列は鏡写し。中央の列は必ず1つ以上埋める
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = (h & 1) === 1;
      h = h >>> 1 || hash(`${seed}:${y}:${x}`);
      cells[y * 5 + x] = on;
      cells[y * 5 + (4 - x)] = on;
    }
  }
  if (![2, 7, 12, 17, 22].some((i) => cells[i])) cells[12] = true;
  return cells;
}

export function Emblem({ seed, className = 'size-5' }: { seed: string; className?: string }) {
  const cells = emblemCells(seed);
  return (
    <svg viewBox="0 0 5 5" className={className} fill="currentColor" aria-hidden shapeRendering="crispEdges">
      {cells.map((on, i) => (on ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" /> : null))}
    </svg>
  );
}
