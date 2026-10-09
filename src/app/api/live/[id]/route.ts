import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * 募集詳細の自動確認 (参加していない方) 用の小さな状態。人数・状態だけで、誰が見ても同じ。
 * Vercel の CDN に10秒置くので、何人が開いていても DB への問い合わせは10秒に1回程度になる。
 * proxy.ts の対象から外している (Set-Cookie が付くと CDN に置かれないため)。
 */
const readLive = unstable_cache(
  async (id: string) => {
    const { data, error } = await createPublicClient()
      .from('recruitments')
      .select('approved_count, status, hidden_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  ['recruitment-live-v1'],
  { revalidate: 10 },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  try {
    const data = await readLive(id);
    return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } });
  } catch {
    return Response.json({ error: 'busy' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
