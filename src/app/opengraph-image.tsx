import { ImageResponse } from 'next/og';
import { OG_COLORS, OG_SIZE, OgLogo, loadOgFont, ogFonts } from '@/lib/og';

export const alt = 'JOIN◆COMPASS #コンパスの募集掲示板 (非公式)';
export const size = OG_SIZE;
export const contentType = 'image/png';

const LEAD = '共に遊べる人を探す';
const SUB = '#コンパスの募集掲示板 (非公式)';
const PURPOSES = ['バトルアリーナ', 'フリーバトル', '大会練習', 'カスタム', 'チャレンジバトル'];

export default async function Image() {
  const font = await loadOgFont(`JOINCOMPASS${LEAD}${SUB}${PURPOSES.join('')}`);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: OG_COLORS.paper,
          padding: '64px 72px',
          fontFamily: 'Zen Kaku Gothic New',
          borderBottom: `24px solid ${OG_COLORS.signal}`,
        }}
      >
        <OgLogo size={56} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, color: OG_COLORS.ink, lineHeight: 1.15 }}>{LEAD}</div>
          <div style={{ fontSize: 36, color: OG_COLORS.muted, marginTop: 20 }}>{SUB}</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {PURPOSES.map((p) => (
            <div key={p} style={{ display: 'flex', fontSize: 26, color: OG_COLORS.ink, border: `3px solid ${OG_COLORS.ink}`, padding: '8px 16px' }}>
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: ogFonts(font) },
  );
}
