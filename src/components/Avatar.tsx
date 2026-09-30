const HUES = [190, 145, 28, 275, 330, 48, 215];

function hueOf(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return HUES[h % HUES.length];
}

/** 名前の頭文字アイコン (画像は使わない) */
export function Avatar({
  name,
  seed,
  size = 'md',
  ring = false,
}: {
  name: string;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
}) {
  const initial = Array.from(name.trim())[0] ?? '?';
  const hue = hueOf(seed ?? name);
  const dim = size === 'lg' ? 'size-14 text-xl' : size === 'sm' ? 'size-8 text-xs' : 'size-11 text-base';
  return (
    <span
      aria-hidden
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full font-extrabold ${ring ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : ''}`}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 70% 38%), hsl(${(hue + 40) % 360} 65% 26%))`,
        color: `hsl(${hue} 100% 92%)`,
      }}
    >
      {initial}
    </span>
  );
}

/** 空き枠 (点線) */
export function EmptySeat({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'size-14' : size === 'sm' ? 'size-8' : 'size-11';
  return <span aria-hidden className={`${dim} inline-block shrink-0 rounded-full border-2 border-dashed border-line`} />;
}
