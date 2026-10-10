import { Shield, Sword, type LucideIcon } from 'lucide-react';
import { PLAY_ROLES, PLAY_ROLE_LABELS, type PlayRole } from '@/lib/constants';

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

/**
 * スプリンター用のアイコン (自作)。運営者の指定で脚の形 (絵文字の 🦵 のような、膝を曲げた脚と足先)。
 * 前は足跡で、何のロールか分かりにくいという声があった。
 */
function LegIcon({ className, ...rest }: React.SVGProps<SVGSVGElement>) {
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
      {/* 腰から膝へ横に伸びる太もも → 膝 → 下へ伸びるすね → 左を向いた足先 */}
      <path d="M7 3h12.5c2.2 0 3.2 1.6 3 3.4-.2 1.6-1.4 2.6-3 2.8l-8.2 1.4c-.7.1-1.1.7-1.1 1.4l.6 7.6c.1 1-.1 1.6-.6 2.4H2.6c.4-1.3 1.6-2.2 3.3-2.8L4.2 6.6C3.9 4.6 5.1 3 7 3z" />
    </svg>
  );
}

type IconComponent = LucideIcon | typeof PistolIcon;

export const ROLE_ICON: Record<PlayRole, IconComponent> = {
  attacker: Sword,
  gunner: PistolIcon,
  tank: Shield,
  sprinter: LegIcon,
};

/** ロールのアイコン (公式の素材は使わず、汎用・自作のアイコンで表す)。framed は細い枠で囲む (小さく並べるとき用) */
export function RoleIcon({ role, className = 'size-4', framed = false }: { role: PlayRole; className?: string; framed?: boolean }) {
  const Icon = ROLE_ICON[role];
  const icon = <Icon className={className} aria-label={PLAY_ROLE_LABELS[role]} role="img" />;
  if (!framed) return icon;
  return <span className="inline-flex items-center justify-center border-[1.5px] border-current p-[2px]">{icon}</span>;
}

/** 4つのロールをすべて選んでいる */
export function isAllRounder(roles: readonly PlayRole[]): boolean {
  return PLAY_ROLES.every((r) => roles.includes(r));
}
