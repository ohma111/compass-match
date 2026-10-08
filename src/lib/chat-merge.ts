import type { Message } from './types';

/**
 * 画面にあるメッセージと、サーバーから取り直したメッセージを合わせる (id で重複を除き、時刻順)。
 * Realtime (WebSocket) がつながらない環境でも、15秒ごとの確認で新しい発言があれば描き直す (LobbyLineup) ので、そのとき出る。
 */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
