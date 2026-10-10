'use client';

/** その場に出す確認 (window.confirm はアプリ内ブラウザで出ずに false が返り、押しても何も起きないことがある) */
export function InlineConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  submit = false,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** 確認のボタンで、囲んでいるフォームを送る */
  submit?: boolean;
}) {
  return (
    <div role="group" aria-label={message} className="space-y-2">
      <p className="text-sm font-bold">{message}</p>
      <div className="flex flex-col gap-2">
        <button type={submit ? 'submit' : 'button'} className={`${danger ? 'btn-danger' : 'btn-primary'} w-full`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
        <button type="button" className="btn-outline w-full" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}
