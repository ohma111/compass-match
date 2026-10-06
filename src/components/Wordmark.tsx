/** サイト名「JOIN◆COMPASS」。間のひし形は朱 (目的の刻印と同じ形) */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center font-display font-black tracking-[0.02em] uppercase [font-stretch:80%] ${className}`}>
      JOIN
      <span aria-hidden className="mx-[0.22em] inline-block size-[0.36em] rotate-45 bg-signal" />
      <span className="sr-only"> </span>
      COMPASS
    </span>
  );
}
