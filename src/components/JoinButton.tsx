'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Hand, Zap } from 'lucide-react';
import { requestJoinAction } from '@/app/actions';
import { authGateHref, saveIntent } from '@/lib/intent';
import { joinButtonLabel } from '@/lib/capacity';
import type { JoinMode } from '@/lib/constants';

export type AuthState = 'guest' | 'no-profile' | 'ready' | 'restricted';

/**
 * 「参加する」ボタン。未ログインなら押した操作を記録してログインへ進み、
 * ログイン・初回登録の後に詳細ページで自動的に参加を再開する。
 */
export function JoinButton({
  recruitmentId,
  joinMode,
  auth,
  canJoin,
  reason,
  isOwner,
  joined,
  src,
  size = 'md',
}: {
  recruitmentId: string;
  joinMode: JoinMode;
  auth: AuthState;
  canJoin: boolean;
  reason?: string;
  isOwner: boolean;
  joined: boolean;
  src?: string | null;
  size?: 'md' | 'lg';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const detail = `/recruitments/${recruitmentId}`;
  const sizing = size === 'lg' ? 'btn-lg w-full' : 'w-full min-h-12 text-base';

  if (isOwner || joined) {
    return (
      <Link href={detail} className={`btn-outline ${sizing}`}>
        {isOwner ? '自分の募集をひらく' : '参加中・部屋番号を見る'}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    );
  }
  if (done) {
    return <p className={`btn border border-ok/40 bg-ok/10 text-ok ${sizing}`} role="status">{done}</p>;
  }
  if (!canJoin || auth === 'restricted') {
    return (
      <p className={`btn border border-line bg-surface-2 text-muted ${sizing}`} aria-disabled="true">
        {auth === 'restricted' ? '現在ご利用いただけません' : reason}
      </p>
    );
  }

  function onClick() {
    setError(null);
    if (auth === 'guest' || auth === 'no-profile') {
      saveIntent({ kind: 'join', recruitmentId });
      router.push(authGateHref(auth, detail));
      return;
    }
    start(async () => {
      const r = await requestJoinAction(recruitmentId, src ?? null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data?.joined) {
        router.push(`${detail}?joined=1`);
      } else {
        setDone('申請しました・承認待ち');
        router.refresh();
      }
    });
  }

  const Icon = joinMode === 'instant' ? Zap : Hand;
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={onClick} disabled={pending} className={`btn-primary ${sizing}`}>
        <Icon className="size-5" aria-hidden />
        {pending ? '処理中…' : joinButtonLabel(joinMode)}
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
