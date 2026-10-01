'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { sendMessageAction } from '@/app/actions';
import { getBrowserClient } from '@/lib/supabase/client';
import { formatJstTime } from '@/lib/time';
import { containsUrl } from '@/lib/validation/url';
import { LIMITS } from '@/lib/constants';
import { ReportButton } from '@/components/ReportButton';
import type { Message } from '@/lib/types';

export function ChatRoom({
  recruitmentId,
  viewerId,
  initialMessages,
  names,
  open,
}: {
  recruitmentId: string;
  viewerId: string;
  initialMessages: Message[];
  names: Record<string, string>;
  open: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reportingId, setReportingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Supabase Realtime: RLSにより、メンバー以外には配信されない
  useEffect(() => {
    let supabase;
    try {
      supabase = getBrowserClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`messages:${recruitmentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recruitment_id=eq.${recruitmentId}` },
        (payload) => {
          const m = payload.new as Message & { hidden_at?: string | null };
          if (m.hidden_at) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [recruitmentId]);

  useEffect(() => {
    // 一覧の中だけを最下部へ (ページ全体はスクロールさせない。部屋番号より先にチャットへ飛ばないように)
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const trimmed = body.trim();
  const localError =
    trimmed.length > LIMITS.message
      ? `${LIMITS.message}文字以内で入力してください`
      : containsUrl(trimmed)
        ? 'URLは送信できません'
        : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || localError) return;
    setError(null);
    start(async () => {
      const r = await sendMessageAction(recruitmentId, trimmed);
      if (r.ok) setBody('');
      else setError(r.error);
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="chat-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="chat-title" className="section-title inline-flex items-center gap-2">
          <MessageCircle className="size-4" aria-hidden />
          チャット
        </h2>
        <span className="text-xs text-slate">終了6時間後に消えます</span>
      </div>
      <div ref={listRef} className="max-h-96 space-y-3 overflow-y-auto border-y-2 border-ink bg-sheet px-3 py-4" aria-live="polite">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-slate">まだメッセージはありません。あいさつしてみましょう。</p>}
        {messages.map((m) => {
          const mine = m.user_id === viewerId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="mb-0.5 flex items-center text-xs text-slate">
                <span className="font-bold">{mine ? 'あなた' : (names[m.user_id] ?? 'メンバー')}</span>
                <span className="ml-1.5 tabular-nums">{formatJstTime(m.created_at)}</span>
                {!mine && (
                  <button
                    type="button"
                    className="-my-3 ml-1 min-h-11 px-2 underline"
                    onClick={() => setReportingId(reportingId === m.id ? null : m.id)}
                  >
                    通報
                  </button>
                )}
              </div>
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-relaxed ${
                  mine ? 'bg-ally text-white' : 'bg-tint text-ink'
                }`}
              >
                {m.body}
              </p>
              {reportingId === m.id && <ReportButtonOpen id={m.id} />}
            </div>
          );
        })}
      </div>
      {open ? (
        <form onSubmit={submit} className="space-y-1">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={1}
              maxLength={LIMITS.message + 50}
              className="input field-sizing-content max-h-32 resize-none"
              placeholder="メッセージ (URL・画像は送れません)"
              aria-label="メッセージ"
            />
            <button
              className="btn-primary size-12 shrink-0 px-0"
              disabled={pending || !trimmed || Boolean(localError)}
              aria-label="送信"
            >
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-bold text-signal-deep" role="alert">{localError ?? error}</span>
            <span className={trimmed.length > LIMITS.message ? 'text-signal-deep' : 'text-slate'}>
              {trimmed.length}/{LIMITS.message}
            </span>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate">この募集は終了したため、メッセージを送信できません。</p>
      )}
    </section>
  );
}

function ReportButtonOpen({ id }: { id: string }) {
  return (
    <div className="w-full">
      <ReportButton targetType="message" targetId={id} initiallyOpen />
    </div>
  );
}
