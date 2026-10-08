import 'server-only';

// 共有カード (X・Discord・LINE で URL を貼ったときの画像)。紙 #efede6・墨・朱 #ff4a1c の1色。
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_COLORS = { paper: '#efede6', ink: '#121212', signal: '#ff4a1c', muted: '#5b5850' };

/**
 * 画像に入れる文字だけの日本語フォントを Google Fonts から取る (text= で使う字だけに絞るので数十KB)。
 * 取れなかったら null (画像は ImageResponse の既定のフォントで出す。日本語は欠けるが落ちはしない)。
 */
export async function loadOgFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const chars = [...new Set(text)].join('');
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@900&text=${encodeURIComponent(chars)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export function ogFonts(data: ArrayBuffer | null) {
  return data ? [{ name: 'Zen Kaku Gothic New', data, weight: 900 as const, style: 'normal' as const }] : [];
}

/** ロゴ (斜めの3本線 + JOIN◆COMPASS) */
export function OgLogo({ size = 44 }: { size?: number }) {
  const bar = { width: size * 0.22, height: size * 0.72, transform: 'skewX(-12deg)', marginRight: size * 0.06 };
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', marginRight: size * 0.3 }}>
        <div style={{ ...bar, background: OG_COLORS.ink }} />
        <div style={{ ...bar, background: OG_COLORS.ink }} />
        <div style={{ ...bar, background: OG_COLORS.signal }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: size, color: OG_COLORS.ink, letterSpacing: '0.02em' }}>
        JOIN
        <div style={{ width: size * 0.36, height: size * 0.36, background: OG_COLORS.signal, transform: 'rotate(45deg)', margin: `0 ${size * 0.22}px` }} />
        COMPASS
      </div>
    </div>
  );
}
