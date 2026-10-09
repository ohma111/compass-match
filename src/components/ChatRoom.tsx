'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { sendMessageAction } from '@/app/actions';
import { getBrowserClient } from '@/lib/supabase/client';
import { formatJstTime } from '@/lib/time';
import { BANNED_MESSAGE, CONTACT_MESSAGE, containsBanned, containsContact } from '@/lib/moderation/banned';
import { containsUrl } from '@/lib/validation/url';
import { LIMITS } from '@/lib/constants';
import { ReportButton } from '@/components/ReportButton';
import type { Message } from '@/lib/types';
import { mergeMessages } from '@/lib/chat-merge';

export function ChatRoom({
  recruitmentId,
  viewerId,
  initialMessages,
  names,
  blockedIds = [],
  open,
}: {
  recruitmentId: string;
  viewerId: string;
  initialMessages: Message[];
  names: Record<string, string>;
  /** ブロックしている方の発言は中身を出さない */
  blockedIds?: string[];
  open: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // ページが更新されたら (15秒ごとのロビーの更新など)、サーバーから来たメッセージも取り込む
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, initialMessages));
  }, [initialMessages]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reportingId, setReportingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 新しい発言の合図 (Realtime の Broadcast)。合図には中身を載せず、受け取った側が RLS のとおりに読み直す。
  // 前は postgres_changes (DB の変更を Realtime が読み続ける) で、混雑時に DB の CPU の大半を使っていた。
  // 合図が届かない環境でも、LobbyLineup の20秒ごとの確認で新しい発言があれば描き直す。
  const channelRef = useRef<ReturnType<ReturnType<typeof getBrowserClient>['channel']> | null>(null);
  const lastAtRef = useRef<string | null>(null);
  lastAtRef.current = messages.length ? messages[messages.length - 1].created_at : null;
  useEffect(() => {
    let supabase: ReturnType<typeof getBrowserClient>;
    try {
      supabase = getBrowserClient();
    } catch {
      return;
    }
    let fetching = false;
    const pull = async () => {
      if (fetching) return;
      fetching = true;
      try {
        let q = supabase
          .from('messages')
          .select('id, recruitment_id, user_id, body, created_at')
          .eq('recruitment_id', recruitmentId)
          .order('created_at', { ascending: true })
          .limit(50);
        // 時刻はサーバーと端末で少しずれるので、最後の発言の1分前から取り直す (id で重複を除く)
        if (lastAtRef.current) q = q.gte('created_at', new Date(Date.parse(lastAtRef.current) - 60_000).toISOString());
        const { data } = await q;
        if (data?.length) setMessages((prev) => mergeMessages(prev, data as Message[]));
      } finally {
        fetching = false;
      }
    };
    const channel = supabase
      .channel(`chat:${recruitmentId}`)
      .on('broadcast', { event: 'new' }, () => {
        void pull();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
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
        : containsBanned(trimmed)
          ? BANNED_MESSAGE
          : containsContact(trimmed)
            ? CONTACT_MESSAGE
            : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || localError) return;
    setError(null);
    start(async () => {
      const r = await sendMessageAction(recruitmentId, trimmed);
      if (r.ok) {
        setBody('');
        // 自分の発言はすぐ出す (読み直したときは id で重複を除く)
        if (r.data) {
          const sent = { ...r.data, recruitment_id: recruitmentId, user_id: viewerId };
          setMessages((prev) => mergeMessages(prev, [sent]));
        }
        void channelRef.current?.send({ type: 'broadcast', event: 'new', payload: {} });
      } else setError(r.error);
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="chat-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="chat-title" className="section-title inline-flex items-center gap-2">
          <MessageCircle className="size-4" aria-hidden />
          チャット
        </h2>
        <span className="text-xs text-slate">募集終了の90分後に消えます</span>
      </div>
      <div ref={listRef} className="max-h-96 space-y-3 overflow-y-auto border-y-2 border-ink bg-sheet px-3 py-4" aria-live="polite">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-slate">まだメッセージはありません</p>}
        {messages.map((m) => {
          const mine = m.user_id === viewerId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="mb-0.5 flex items-center text-xs text-slate">
                <span className="font-bold">{mine ? 'あなた' : (names[m.user_id] ?? '参加者')}</span>
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
                  mine ? 'bg-ink text-white' : 'bg-tint text-ink'
                }`}
              >
                {!mine && blockedIds.includes(m.user_id) ? (
                  <span className="text-slate italic">ブロックしている方のメッセージです</span>
                ) : containsBanned(m.body) || containsContact(m.body) ? (
                  <span className="text-slate italic">このメッセージは表示できません</span>
                ) : (
                  m.body
                )}
              </p>
              {reportingId === m.id && <ReportButtonOpen id={m.id} />}
            </div>
          );
        })}
      </div>
      {open ? (
        <form onSubmit={submit} className="space-y-1">
          <div className="flex items-end gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={LIMITS.message}
              enterKeyHint="send"
              autoComplete="off"
              className="input"
              placeholder="20文字まで"
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
        <p className="text-sm text-slate">この募集は終了しました</p>
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
