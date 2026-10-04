import type { Seat } from '@/components/Lineup';
import type { Participation, Recruitment } from './types';
import { remainingSlots } from './capacity';

/**
 * 募集の席を並べる: 募集者 → 参加が確定した人 → (未ログインで名前が見えない参加者) → 空き。
 * 未ログインの閲覧者は参加者一覧を読めないので、人数だけを匿名の席で表す。
 */
export function seatsFor(
  r: Pick<Recruitment, 'owner_id' | 'capacity' | 'approved_count' | 'owner' | 'id'>,
  opts: {
    approved?: Participation[];
    viewerId?: string | null;
    knowsMembers?: boolean;
    linkProfiles?: boolean;
    enterUserId?: string | null;
  } = {},
): Seat[] {
  const seats: Seat[] = [
    {
      kind: 'owner',
      id: r.owner_id,
      name: r.owner?.display_name ?? '募集者',
      rank: r.owner?.rank_band ?? null,
      roles: r.owner?.play_roles ?? [],
      you: Boolean(opts.viewerId && opts.viewerId === r.owner_id),
      href: opts.linkProfiles ? `/users/${r.owner_id}` : undefined,
    },
  ];
  const approved = opts.approved ?? [];
  if (opts.knowsMembers) {
    for (const p of approved) {
      seats.push({
        kind: 'member',
        id: p.user_id,
        name: p.profile?.display_name ?? '(非表示のユーザー)',
        rank: p.profile?.rank_band ?? null,
        roles: p.profile?.play_roles ?? [],
        you: p.user_id === opts.viewerId,
        href: opts.linkProfiles ? `/users/${p.user_id}` : undefined,
        enter: Boolean(opts.enterUserId && p.user_id === opts.enterUserId),
      });
    }
  }
  const named = seats.length - 1;
  for (let i = named; i < r.approved_count; i++) seats.push({ kind: opts.knowsMembers ? 'member' : 'anon', name: '参加者' });
  for (let i = 0; i < remainingSlots(r.capacity, r.approved_count); i++) seats.push({ kind: 'empty' });
  return seats.slice(0, Math.max(r.capacity, 1));
}
