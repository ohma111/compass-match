import Script from 'next/script';
import { AdPush } from './AdPush';
import type { AdPlacement } from '@/lib/plan';

/**
 * 広告の枠。出すかどうか (shouldShowAds) はページ側で決め、ここには出すときだけ渡す。
 * 高さを先に取っておき、広告が後から入っても下の内容が動かないようにする。
 * 募集カード・参加ボタン・チャットの間には置かない (押し間違いを防ぐ。AdSense の規約でも禁止)。
 */
export function AdSlot({
  placement,
  client,
  slot,
  placeholder = false,
}: {
  placement: AdPlacement;
  client: string | null;
  slot: string | null;
  /** 開発用プレビュー: 広告の代わりに枠だけ出す */
  placeholder?: boolean;
}) {
  if (!placeholder && (!client || !slot)) return null;
  return (
    <aside aria-label="広告" className="mt-10 border-t-2 border-ink pt-2">
      <p className="type-tag text-[10px] text-slate">広告</p>
      <div className={`mt-2 w-full overflow-hidden ${placement === 'list' ? 'h-[100px] lg:h-[250px]' : 'h-[100px]'}`}>
        {placeholder ? (
          <div className="flex h-full items-center justify-center border border-dashed border-ink/40 text-xs text-slate">AD</div>
        ) : (
          <>
            <Script
              id="adsbygoogle"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
              strategy="lazyOnload"
              crossOrigin="anonymous"
            />
            <ins
              className="adsbygoogle block h-full w-full"
              data-ad-client={client!}
              data-ad-slot={slot!}
              data-full-width-responsive="false"
            />
            <AdPush />
          </>
        )}
      </div>
    </aside>
  );
}
