import { LIMITS } from './constants';
import { containsUrl } from './validation/url';

type Meta = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * ログイン時のプロバイダ情報から表示名の初期値を作る。
 * Discord: custom_claims.global_name → full_name → name (旧形式の "#0" は除去)。X: name → user_name。
 * 使えない値(空・URLを含む)は空文字を返す。本人が画面で変更できる。
 */
export function displayNameFromMetadata(meta: Meta): string {
  if (!meta) return '';
  const claims = (meta.custom_claims ?? null) as Meta;
  const candidates = [
    str(claims?.global_name),
    str(meta.global_name),
    str(meta.full_name),
    str(meta.name),
    str(meta.user_name),
    str(meta.preferred_username),
  ];
  for (const raw of candidates) {
    const v = raw
      .replace(/#0$/, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim();
    if (!v || containsUrl(v)) continue;
    return Array.from(v).slice(0, LIMITS.displayName).join('').trim();
  }
  return '';
}
