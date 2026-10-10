import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { dispatchPush } from '@/lib/push/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceRoleKey } from '@/lib/env';

/**
 * DB の毎分の定期処理 (private.tick) が知らせを作ったときに、pg_net で呼ぶ (予定時刻・自動終了の知らせのプッシュ)。
 * 合言葉 (server_secrets の dispatch_token) が合うときだけ送る。送るのは「まだ送っていない通知」だけなので、何度呼ばれても二重には送らない。
 */
let token: string | null = null;

async function dispatchToken(): Promise<string | null> {
  if (token) return token;
  if (!getServiceRoleKey()) return null;
  const { data } = await createAdminClient().from('server_secrets').select('value').eq('key', 'dispatch_token').maybeSingle();
  token = (data as { value: string } | null)?.value ?? null;
  return token;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const given = req.headers.get('x-dispatch-token') ?? '';
  const expected = await dispatchToken().catch(() => null);
  if (!expected || !given || !same(given, expected)) return Response.json({ error: 'forbidden' }, { status: 403 });
  after(() => dispatchPush());
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
