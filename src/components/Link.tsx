import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/**
 * next/link の代わりに使うリンク。先読み (prefetch) をしない。
 * ページはどれも動的 (ログイン状態で変わる) なので、先読みのたびに Vercel の関数が動く。
 * 一覧を1回見るだけで募集カードの数だけ関数が動いていた (本番で1回に約40回)。
 * 押したときに1回だけ読みに行く。必要なリンクだけ prefetch を明示すれば先読みもできる。
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
