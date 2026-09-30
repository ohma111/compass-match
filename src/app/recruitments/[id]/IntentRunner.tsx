'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestJoinAction } from '@/app/actions';
import { takeIntent } from '@/lib/intent';

/** ログイン前に押した「参加する」を、ログイン・初回登録の後に自動で実行する */
export function IntentRunner({ recruitmentId, canJoin, src }: { recruitmentId: string; canJoin: boolean; src: string | null }) {
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const intent = takeIntent((i) => i.kind === 'join' && i.recruitmentId === recruitmentId);
    if (!intent || !canJoin) return;
    setMsg({ ok: true, text: '参加しています…' });
    requestJoinAction(recruitmentId, src).then((r) => {
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      if (r.data?.joined) {
        router.replace(`/recruitments/${recruitmentId}?joined=1`);
      } else {
        setMsg({ ok: true, text: r.message ?? '参加を申請しました' });
        router.refresh();
      }
    });
  }, [recruitmentId, canJoin, src, router]);

  if (!msg) return null;
  return (
    <p className={msg.ok ? 'alert-ok' : 'alert-error'} role="status">
      {msg.text}
    </p>
  );
}
