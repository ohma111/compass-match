// 最小限のService Worker。ページはキャッシュせず(個人情報を端末に残さない)、
// ネットワークに繋がらない時だけ簡単な案内を返す。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>オフライン</title><p style="font-family:sans-serif;padding:24px">オフラインです。電波の良いところで再読み込みしてください。</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
    ),
  );
});

// プッシュ通知 (v6)。本文は募集のタイトルだけで、チャットの中身は載せない
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'JOIN COMPASS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Android は SVG を通知のアイコンに使えないので PNG。badge は通知バーの単色の形
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      for (const c of list) {
        if ('navigate' in c && 'focus' in c) return c.navigate(url).then((w) => (w ? w.focus() : undefined));
      }
      return self.clients.openWindow(url);
    }),
  );
});
