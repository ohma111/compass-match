import { ImageResponse } from 'next/og';
import { getRecruitmentPublic } from '@/lib/queries';
import { OG_COLORS, OG_SIZE, OgLogo, loadOgFont, ogFonts } from '@/lib/og';
import { PURPOSE_LABELS, RANK_MIN_LABELS, type Purpose, type RankBand, type RecruitStatus } from '@/lib/constants';
import { effectiveStatus, occupiedSeats, remainingSlots } from '@/lib/capacity';
import { formatJst } from '@/lib/time';
import { uuidSchema } from '@/lib/validation/schemas';

export const alt = '#コンパスの募集';
export const size = OG_SIZE;
export const contentType = 'image/png';

interface Row {
  title: string;
  purpose: Purpose;
  starts_at: string;
  ends_at: string;
  capacity: number;
  approved_count: number;
  min_rank: RankBand | null;
  status: RecruitStatus;
}

/** 募集を共有したときの画像: 目的・開始・人数 (あと何人)。見られない募集はサイト共通の絵柄 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: Row | null = null;
  let failed = false;
  if (uuidSchema.safeParse(id).success) {
    try {
      // 共有先のクローラーはログインしていないので、未ログインと同じ見え方で読む (10秒まとめて使う)
      r = ((await getRecruitmentPublic(id)) as unknown as Row | null) ?? null;
    } catch {
      r = null;
      failed = true;
    }
  }

  const purpose = r ? PURPOSE_LABELS[r.purpose] ?? '' : '';
  const status = r ? effectiveStatus(r.status, r.ends_at) : null;
  const left = r ? remainingSlots(r.capacity, r.approved_count) : 0;
  const open = status === 'open';
  const big = !r ? '募集を見る' : open ? `あと${left}人` : status === 'full' ? '満員' : status === 'cancelled' ? '取り消し済み' : '終了しました';
  const when = r ? `${formatJst(r.starts_at)} 開始` : '';
  const seats = r && (open || status === 'full') ? `${occupiedSeats(r.capacity, r.approved_count)}/${r.capacity}` : '';
  const rank = r?.min_rank ? RANK_MIN_LABELS[r.min_rank] : '';
  const title = r?.title ?? '#コンパスの募集掲示板 (非公式)';

  const font = await loadOgFont(`JOINCOMPASS${purpose}${big}${when}${seats}${rank}${title}0123456789/:()`);
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
          padding: '56px 72px',
          fontFamily: 'Zen Kaku Gothic New',
          borderBottom: `24px solid ${open ? OG_COLORS.signal : OG_COLORS.ink}`,
        }}
      >
        <OgLogo size={40} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {purpose && (
            <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 34, color: OG_COLORS.paper, background: OG_COLORS.ink, padding: '6px 18px' }}>
              {purpose}
              {rank ? `  ${rank}` : ''}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 52, color: OG_COLORS.ink, marginTop: 24, lineHeight: 1.25, maxHeight: 140, overflow: 'hidden' }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 34, color: OG_COLORS.muted }}>
            {when && <div style={{ display: 'flex' }}>{when}</div>}
            {seats && <div style={{ display: 'flex', marginTop: 6 }}>{`${seats}人`}</div>}
          </div>
          <div style={{ display: 'flex', fontSize: 104, lineHeight: 1, color: open ? OG_COLORS.signal : OG_COLORS.ink }}>{big}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: ogFonts(font),
      // Vercel の CDN に5分置く (X・Discord などが取りに来るたびに関数を動かさない)。人数の表示は最大で数分遅れる。
      // 読み込みに失敗したときの共通の絵柄は30秒だけ
      headers: { 'Cache-Control': failed ? 'public, s-maxage=30' : 'public, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}
