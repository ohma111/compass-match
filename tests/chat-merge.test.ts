import { describe, expect, it } from 'vitest';
import { mergeMessages } from '@/lib/chat-merge';

const m = (id: string, t: string) => ({ id, recruitment_id: 'r', user_id: 'u', body: id, created_at: t });

describe('chat merge (Realtime が使えないときの更新)', () => {
  it('adds new server messages, dedupes by id, keeps time order', () => {
    const current = [m('a', '2026-10-03T10:00:00Z'), m('c', '2026-10-03T10:02:00Z')];
    const incoming = [m('a', '2026-10-03T10:00:00Z'), m('b', '2026-10-03T10:01:00Z')];
    expect(mergeMessages(current, incoming).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('is a no-op for identical lists', () => {
    const list = [m('a', '2026-10-03T10:00:00Z')];
    expect(mergeMessages(list, list)).toHaveLength(1);
  });
});
