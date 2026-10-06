import type { Avatar } from '@/lib/constants';

/**
 * 選べるアイコン (5種類)。線の絵で、色は currentColor (席の色に合わせる)。
 * どれもこのサイトのために描いたもので、既存のキャラクターではない。
 */
export function AvatarIcon({ avatar, className = 'size-6' }: { avatar: Avatar; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (avatar) {
    case 'cat':
      return (
        <svg {...common}>
          <path d="M4.5 9.5 4 3.5l5 3.2a8.6 8.6 0 0 1 6 0l5-3.2-.5 6A7.6 7.6 0 0 1 21 13.5c0 4-4 6.5-9 6.5s-9-2.5-9-6.5a7.6 7.6 0 0 1 1.5-4Z" />
          <circle cx="9" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
          <path d="M10.5 15.5c.5.6 1 .6 1.5 0 .5.6 1 .6 1.5 0" />
        </svg>
      );
    case 'rabbit':
      return (
        <svg {...common}>
          <path d="M9 9.5C7.6 7 7.4 2.5 8.8 2.3c1.5-.2 2.2 3.8 2.2 6.4M15 9.5c1.4-2.5 1.6-7 .2-7.2-1.5-.2-2.2 3.8-2.2 6.4" />
          <ellipse cx="12" cy="15" rx="7" ry="6" />
          <circle cx="9.4" cy="14.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.6" cy="14.2" r="1" fill="currentColor" stroke="none" />
          <path d="M11.2 17.2h1.6" />
        </svg>
      );
    case 'bear':
      return (
        <svg {...common}>
          <circle cx="6" cy="6.5" r="2.6" />
          <circle cx="18" cy="6.5" r="2.6" />
          <circle cx="12" cy="13" r="8" />
          <circle cx="9" cy="11.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11.5" r="1" fill="currentColor" stroke="none" />
          <ellipse cx="12" cy="15.6" rx="2.6" ry="2" />
          <circle cx="12" cy="15" r=".7" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'ghost':
      return (
        <svg {...common}>
          <path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.6-2.3 1.6-2.4-1.6-2.4 1.6-2.3-1.6Z" />
          <circle cx="9.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
          <path d="M11 14.2a1.4 1.4 0 0 0 2 0" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />
          <circle cx="10.2" cy="11.2" r=".9" fill="currentColor" stroke="none" />
          <circle cx="13.8" cy="11.2" r=".9" fill="currentColor" stroke="none" />
          <path d="M10.9 13.3a1.6 1.6 0 0 0 2.2 0" />
        </svg>
      );
  }
}
