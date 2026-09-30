import { beforeEach, describe, expect, it } from 'vitest';
import { authGateHref, INTENT_TTL_MS, saveIntent, takeIntent } from '@/lib/intent';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('resume intent after login', () => {
  it('returns a matching join intent once', () => {
    saveIntent({ kind: 'join', recruitmentId: 'r1' });
    expect(takeIntent((i) => i.kind === 'join' && i.recruitmentId === 'r2')).toBeNull();
    expect(takeIntent((i) => i.kind === 'join' && i.recruitmentId === 'r1')).toEqual({ kind: 'join', recruitmentId: 'r1' });
    expect(takeIntent(() => true)).toBeNull();
  });
  it('expires', () => {
    saveIntent({ kind: 'post' });
    expect(takeIntent(() => true, Date.now() + INTENT_TTL_MS + 1000)).toBeNull();
  });
  it('builds the login / onboarding href', () => {
    expect(authGateHref('guest', '/recruitments/new')).toBe('/login?next=%2Frecruitments%2Fnew');
    expect(authGateHref('no-profile', '/recruitments/abc')).toBe('/welcome?next=%2Frecruitments%2Fabc');
  });
});
