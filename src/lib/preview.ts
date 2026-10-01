// 開発用フィクスチャプレビュー (/dev/preview) の有効判定。
// ページ自体が next.config の pageExtensions で本番ビルドから外れるが、念のためページ内でもこれで確認する。
export function isPreviewEnabled(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'development';
}

/** `*.dev.tsx` のページは開発時だけルートにする (本番ビルドには含めない) */
export function pageExtensionsFor(nodeEnv: string | undefined): string[] {
  return nodeEnv === 'development' ? ['dev.tsx', 'tsx', 'ts'] : ['tsx', 'ts'];
}

/** プレビューできる画面 (scripts/screenshots.mjs もこの順で撮影する) */
export const PREVIEW_SCREENS = ['home', 'home-empty', 'new', 'detail', 'detail-joined', 'signup', 'signup-done', 'login', 'me', 'join-rank'] as const;
