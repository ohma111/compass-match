import { getVapidKeys } from '@/lib/push/server';

/** ブラウザがプッシュ通知を登録するときの公開鍵 */
export async function GET() {
  const keys = await getVapidKeys();
  if (!keys) return Response.json({ error: 'not configured' }, { status: 503 });
  return Response.json({ publicKey: keys.publicKey }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
