/** ロゴ: 3人の席。2つ埋まって、最後の1つが朱 (= 「あと1人」) */
export function LogoMark({ className = 'h-6 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={`${className} shrink-0`} aria-hidden>
      <g transform="skewX(-12) translate(5 0)">
        <rect x="0" y="2" width="9" height="20" fill="currentColor" />
        <rect x="11" y="2" width="9" height="20" fill="currentColor" />
        <rect x="22" y="2" width="9" height="20" fill="#ff4a1c" />
      </g>
    </svg>
  );
}
