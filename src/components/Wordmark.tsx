/** サイト名「コンパス・マッチング」。中黒は朱のひし形 (目的の刻印と同じ形の言葉) */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center font-black tracking-[-0.04em] ${className}`}>
      コンパス
      <span aria-hidden className="mx-[0.14em] inline-block size-[0.3em] rotate-45 bg-signal" />
      <span className="sr-only">・</span>
      マッチング
    </span>
  );
}
