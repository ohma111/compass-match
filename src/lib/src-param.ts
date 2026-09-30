// 流入元パラメータ (?src=) の正規化。DB側 private.clean_src() と同じ規則。
export const SRC_COOKIE = 'cm_src';
const SRC_RE = /^[a-z0-9_-]{1,32}$/;

export function sanitizeSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return SRC_RE.test(v) ? v : null;
}
