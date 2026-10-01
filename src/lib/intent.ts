// ログイン前に押した「参加する」「募集する」を、ログイン・初回登録の後に自動で再開するための記録。
// URLパラメータではなく本人のブラウザ(localStorage)にだけ保存するので、
// 共有リンクを踏んだだけで勝手に参加・投稿されることはない。
export type Intent = { kind: 'join'; recruitmentId: string } | { kind: 'post' };

const KEY = 'cm_intent';
export const INTENT_TTL_MS = 15 * 60_000;

interface Stored {
  intent: Intent;
  at: number;
}

export function saveIntent(intent: Intent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ intent, at: Date.now() } satisfies Stored));
  } catch {
    // ストレージが使えない場合は再開しないだけ
  }
}

/** 期限内で条件に合う記録があれば取り出して消す */
export function takeIntent(match: (i: Intent) => boolean, now: number = Date.now()): Intent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s?.intent || typeof s.at !== 'number' || now - s.at > INTENT_TTL_MS || now < s.at) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (!match(s.intent)) return null;
    localStorage.removeItem(KEY);
    return s.intent;
  } catch {
    return null;
  }
}

/**
 * ログインが必要な操作の遷移先。未ログインなら登録画面 (ログインへのリンクあり)、
 * Discord で入ってプロフィール未作成なら初回登録へ
 */
export function authGateHref(state: 'guest' | 'no-profile', next: string): string {
  const q = `next=${encodeURIComponent(next)}`;
  return state === 'guest' ? `/signup?${q}` : `/welcome?${q}`;
}
