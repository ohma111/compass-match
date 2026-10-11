/**
 * 運営者の名前の横に付ける印 (profiles.is_staff。管理者だけに付く)。
 * 塗りの朱は「あと◯人」に使っているので、枠線だけにする。色は置いた場所の文字色 (className で変える)。
 */
export function StaffBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 border border-current px-1 align-middle text-[10px] leading-[1.4] font-black tracking-normal ${className}`}>
      運営
    </span>
  );
}
