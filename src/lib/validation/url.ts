// URL・画像リンクの検出。DB側 private.contains_url() と同じルール。
// 全角をNFKC正規化してから判定するので「ｈｔｔｐｓ：／／」や「ｅｘａｍｐｌｅ．ｃｏｍ」も検出する。
const TLDS = [
  'com', 'net', 'org', 'jp', 'io', 'gg', 'me', 'ly', 'co', 'app', 'dev', 'xyz', 'info',
  'tv', 'be', 'to', 'link', 'page', 'site', 'ws', 'cc', 'in', 'us', 'uk',
];

const URL_PATTERN = new RegExp(
  `(https?|ftp)://|data:image|[a-z0-9-]+\\s*[.。]\\s*(${TLDS.join('|')})(?![a-z0-9])`,
);

export function normalizeForCheck(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

export function containsUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  return URL_PATTERN.test(normalizeForCheck(text));
}
