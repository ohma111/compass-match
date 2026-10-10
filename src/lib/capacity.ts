import { LIMITS, type JoinMode, type Purpose, type RecruitStatus } from './constants';

// capacity は募集者を含む総人数。参加できる人数は capacity - 1。
// #コンパスは3対3。通常のパーティは最大3人、カスタム(ルームマッチ)は6人まで。

/** 目的ごとに選べる capacity (募集者を含む総人数) */
export function capacityOptions(purpose: Purpose): number[] {
  const max = purpose === 'custom' ? LIMITS.maxCapacity : LIMITS.maxPartyCapacity;
  return Array.from({ length: max - LIMITS.minCapacity + 1 }, (_, i) => i + LIMITS.minCapacity);
}

export function isValidCapacity(purpose: Purpose, capacity: number): boolean {
  return Number.isInteger(capacity) && capacityOptions(purpose).includes(capacity);
}

/** 目的を切り替えたとき、選べない人数なら最大値に丸める */
export function clampCapacity(purpose: Purpose, capacity: number): number {
  const opts = capacityOptions(purpose);
  if (opts.includes(capacity)) return capacity;
  return capacity > opts[opts.length - 1] ? opts[opts.length - 1] : opts[0];
}

export function occupiedSeats(capacity: number, approvedCount: number): number {
  return Math.min(capacity, approvedCount + 1);
}

export function remainingSlots(capacity: number, approvedCount: number): number {
  return Math.max(0, capacity - 1 - approvedCount);
}

export function isFull(capacity: number, approvedCount: number): boolean {
  return remainingSlots(capacity, approvedCount) === 0;
}

/** 枠の埋まり具合 (●●○)。true = 埋まっている枠 */
export function slotDots(capacity: number, approvedCount: number): boolean[] {
  const filled = occupiedSeats(capacity, approvedCount);
  return Array.from({ length: capacity }, (_, i) => i < filled);
}

/** 一覧・詳細の短い表示。「@1人」(あと1人) / 「満員」 */
export function leftLabel(capacity: number, approvedCount: number): string {
  const left = remainingSlots(capacity, approvedCount);
  return left > 0 ? `@${left}人` : '満員';
}

/** 読み上げ用。例: 「3人中2人・あと1人」 */
export function seatLabel(capacity: number, approvedCount: number): string {
  const left = remainingSlots(capacity, approvedCount);
  return `${capacity}人中${occupiedSeats(capacity, approvedCount)}人・${left > 0 ? `あと${left}人` : '満員'}`;
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

/** 参加ボタンを押せるか。押せない場合は表示用の理由を返す */
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
  if (st === 'ended') return { ok: false, reason: '終了しました' };
  if (st === 'cancelled') return { ok: false, reason: '取り消された募集です' };
  if (args.myState === 'pending') return { ok: false, reason: '承認待ち' };
  if (args.myState === 'approved') return { ok: false, reason: '参加中' };
  if (args.myState === 'rejected') return { ok: false, reason: '参加できません' };
  if (st === 'full' || isFull(args.capacity, args.approvedCount)) return { ok: false, reason: '満員' };
  return { ok: true };
}

/** 参加ボタンの文言 */
export function joinButtonLabel(mode: JoinMode): string {
  return mode === 'instant' ? '参加する' : '参加を申請する';
}

/** 募集者が承認できるか */
export function canApprove(capacity: number, approvedCount: number, status: RecruitStatus, endsAt: Date | string, now?: Date): boolean {
  return effectiveStatus(status, endsAt, now) === 'open' && !isFull(capacity, approvedCount);
}
