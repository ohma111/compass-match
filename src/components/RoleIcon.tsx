import { Footprints, Shield, Sword, type LucideIcon } from 'lucide-react';
import { PLAY_ROLE_LABELS, type PlayRole } from '@/lib/constants';

/**
 * ガンナー用の小さな拳銃アイコン (自作。lucide と同じ 24px・線幅2・丸い線端)。
 * 公式の素材やブランドの絵柄は使っていない。
 */
function PistolIcon({ className, ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {/* スライド (右向き) */}
      <path d="M2 6h19v5H2z" />
      {/* 照星 */}
      <path d="M19 6V4.5" />
      {/* グリップ (後ろ寄りに斜め下へ) */}
      <path d="M4 11l-1.5 8h4.5l1.5-8" />
      {/* 引き金のガード */}
      <path d="M8.5 11v3.5h4V11" />
    </svg>
  );
}

type IconComponent = LucideIcon | typeof PistolIcon;

export const ROLE_ICON: Record<PlayRole, IconComponent> = {
  attacker: Sword,
  gunner: PistolIcon,
  tank: Shield,
  sprinter: Footprints,
};

/** ロールのアイコン (公式の素材は使わず、汎用・自作のアイコンで表す) */
export function RoleIcon({ role, className = 'size-4' }: { role: PlayRole; className?: string }) {
  const Icon = ROLE_ICON[role];
  return <Icon className={className} aria-label={PLAY_ROLE_LABELS[role]} role="img" />;
}
