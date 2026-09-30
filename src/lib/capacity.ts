import type { RecruitStatus } from './constants';

// capacity は募集者を含む総人数。承認できる参加者数は capacity - 1。
export function occupiedSeats(approvedCount: number): number {
  return approvedCount + 1;
}

export function remainingSlots(capacity: number, approvedCount: number): number {
  return Math.max(0, capacity - 1 - approvedCount);
}

export function isFull(capacity: number, approvedCount: number): boolean {
  return remainingSlots(capacity, approvedCount) === 0;
}

/** 例: 「現在2/3人」 */
export function seatLabel(capacity: number, approvedCount: number): string {
  return `現在${Math.min(occupiedSeats(approvedCount), capacity)}/${capacity}人`;
}

/** DB側 private.effective_status と同じ判定。終了時刻を過ぎていれば ended */
export function effectiveStatus(
  status: RecruitStatus,
  endsAt: Date | string,
  now: Date = new Date(),
): RecruitStatus {
  if (status === 'cancelled' || status === 'ended') return status;
  if (new Date(endsAt).getTime() <= now.getTime()) return 'ended';
  return status;
}

export type JoinState = 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled';

/** 参加申請ボタンを出せるか */
export function canRequestJoin(args: {
  status: RecruitStatus;
  endsAt: Date | string;
  capacity: number;
  approvedCount: number;
  isOwner: boolean;
  myState: JoinState;
  now?: Date;
}): { ok: boolean; reason?: string } {
  if (args.isOwner) return { ok: false, reason: '自分の募集です' };
  const st = effectiveStatus(args.status, args.endsAt, args.now);
  if (st === 'ended') return { ok: false, reason: 'この募集は終了しました' };
  if (st === 'cancelled') return { ok: false, reason: 'この募集は取り消されました' };
  if (args.myState === 'pending') return { ok: false, reason: '承認待ちです' };
  if (args.myState === 'approved') return { ok: false, reason: '参加が承認されています' };
  if (args.myState === 'rejected') return { ok: false, reason: 'この募集には申請できません' };
  if (st === 'full' || isFull(args.capacity, args.approvedCount)) return { ok: false, reason: '満員です' };
  return { ok: true };
}

/** 募集者が承認できるか */
export function canApprove(capacity: number, approvedCount: number, status: RecruitStatus, endsAt: Date | string, now?: Date): boolean {
  return effectiveStatus(status, endsAt, now) === 'open' && !isFull(capacity, approvedCount);
}
