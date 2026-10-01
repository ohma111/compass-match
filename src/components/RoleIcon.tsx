import { ChevronsRight, Crosshair, Shield, Sword, type LucideIcon } from 'lucide-react';
import { PLAY_ROLE_LABELS, type PlayRole } from '@/lib/constants';

export const ROLE_ICON: Record<PlayRole, LucideIcon> = {
  attacker: Sword,
  gunner: Crosshair,
  tank: Shield,
  sprinter: ChevronsRight,
};

/** ロールのアイコン (公式の素材は使わず、汎用アイコンで表す) */
export function RoleIcon({ role, className = 'size-4' }: { role: PlayRole; className?: string }) {
  const Icon = ROLE_ICON[role];
  return <Icon className={className} aria-label={PLAY_ROLE_LABELS[role]} role="img" />;
}
