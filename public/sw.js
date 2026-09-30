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
