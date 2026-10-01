/** ロゴ: 3人の席。2つ埋まって1つ空いている (= 「あと1人」) */
export function LogoMark({ className = 'h-6 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={`${className} shrink-0`} aria-hidden>
      <g transform="skewX(-12) translate(5 0)">
        <rect x="0" y="2" width="9" height="20" fill="#8fa2ff" />
        <rect x="11" y="2" width="9" height="20" fill="#ffffff" />
        <rect x="23" y="3" width="8" height="18" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 2.2" />
      </g>
    </svg>
  );
}
