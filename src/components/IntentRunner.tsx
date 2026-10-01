'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestJoinAction } from '@/app/actions';
import { takeIntent } from '@/lib/intent';
import { RankPrompt } from './RankPrompt';

/**
 * ログイン前に押した「参加する」を、登録・ログインの後に自動で実行する。
 * ユーザーIDで登録したばかりの人は、先にランク帯を1タップで選んでもらう。
 */
export function IntentRunner({
  recruitmentId,
  canJoin,
  src,
  needsRank = false,
}: {
  recruitmentId: string;
  canJoin: boolean;
  src: string | null;
  needsRank?: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [askRank, setAskRank] = useState(false);

  function run() {
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
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const intent = takeIntent((i) => i.kind === 'join' && i.recruitmentId === recruitmentId);
    if (!intent || !canJoin) return;
    if (needsRank) {
      setAskRank(true);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitmentId, canJoin, needsRank]);

  if (askRank) {
    return (
      <RankPrompt
        verb="参加"
        onConfirmed={() => {
          setAskRank(false);
          run();
        }}
      />
    );
  }
  if (!msg) return null;
  return (
    <p className={msg.ok ? 'alert-ok' : 'alert-error'} role="status">
      {msg.text}
    </p>
  );
}
