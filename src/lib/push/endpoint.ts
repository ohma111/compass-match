// プッシュ通知の登録先として受け付ける URL。DB の private.is_push_endpoint と同じルール
// (各ブラウザのプッシュサーバーだけ。任意の URL へサーバーから送らせない)。
const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === 'string' && endpoint.length <= 1000 && PUSH_ENDPOINT.test(endpoint);
}
