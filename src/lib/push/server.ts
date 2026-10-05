import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '../supabase/admin';
import { getServiceRoleKey, siteUrl } from '../env';
import { NOTIFICATION_LABELS } from '../constants';

/**
 * プッシュ通知 (Web Push)。
 * 鍵 (VAPID) はサーバーが初回に自動で作り、DB の server_secrets (service_role だけが読める) に保存する。
 * 人が鍵をコピーして設定する手順はない。
 */
interface Keys {
  publicKey: string;
  privateKey: string;
}
let cached: Keys | null = null;

export async function getVapidKeys(): Promise<Keys | null> {
  if (cached) return cached;
  if (!getServiceRoleKey()) {
    console.error('[push] SUPABASE_SERVICE_ROLE_KEY がない');
    return null;
  }
  const db = createAdminClient();
  const read = async () => {
    const { data, error } = await db.from('server_secrets').select('key, value').in('key', ['vapid_public', 'vapid_private']);
    if (error) console.error('[push] read keys', error.code, error.message);
    const m = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const pub = m.get('vapid_public');
    const priv = m.get('vapid_private');
    return pub && priv ? { publicKey: pub, privateKey: priv } : null;
  };
  let keys = await read();
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    // 同時に2つ作られても、先に入った方だけが残る (on conflict do nothing)
    const { error } = await db.from('server_secrets').upsert(
      [
        { key: 'vapid_public', value: k.publicKey },
        { key: 'vapid_private', value: k.privateKey },
      ],
      { onConflict: 'key', ignoreDuplicates: true },
    );
    if (error) console.error('[push] save keys', error.code, error.message);
    keys = await read();
  }
  cached = keys;
  return keys;
}

interface Row {
  id: string;
  user_id: string;
  kind: string;
  recruitment_id: string | null;
  recruitment: { title: string; owner: { display_name: string } | null } | null;
}

/**
 * まだ送っていない通知をプッシュする。Server Action の after() から呼ぶ。
 * 先に pushed_at を入れてから送るので、同時に呼ばれても二重には送らない。
 */
export async function dispatchPush(): Promise<void> {
  try {
    const keys = await getVapidKeys();
    if (!keys) return;
    const db = createAdminClient();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: claimed } = await db
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .is('pushed_at', null)
      .gt('created_at', since)
      .select('id, user_id, kind, recruitment_id, recruitment:recruitments(title, owner:profiles!recruitments_owner_id_fkey(display_name))')
      .limit(100);
    const rows = (claimed ?? []) as unknown as Row[];
    if (rows.length === 0) return;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: subs } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds);
    if (!subs?.length) return;
    webpush.setVapidDetails(siteUrl() || 'https://compass-match.vercel.app', keys.publicKey, keys.privateKey);
    const dead: string[] = [];
    await Promise.all(
      rows.flatMap((n) =>
        subs
          .filter((s) => s.user_id === n.user_id)
          .map(async (s) => {
            const payload = JSON.stringify({
              title:
                n.kind === 'followed_posted' && n.recruitment?.owner
                  ? `${n.recruitment.owner.display_name}さんが募集を出しました`
                  : (NOTIFICATION_LABELS[n.kind] ?? 'コンパス・マッチング'),
              body: n.recruitment?.title ?? '',
              url: n.recruitment_id ? `/recruitments/${n.recruitment_id}` : '/notifications',
              tag: n.recruitment_id ? `r-${n.recruitment_id}-${n.kind}` : n.kind,
            });
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
                TTL: 60 * 60,
                urgency: 'high',
              });
            } catch (e) {
              const code = (e as { statusCode?: number }).statusCode;
              if (code === 404 || code === 410) dead.push(s.id);
            }
          }),
      ),
    );
    if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  } catch {
    // 通知が送れなくても元の操作は成功させる
  }
}
