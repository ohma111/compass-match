import { describe, expect, it } from 'vitest';
import { AUTH_COOKIE_MAX_AGE, isAuthCookie, persistentCookieOptions } from '@/lib/auth-cookies';

describe('v4: session cookies are re-issued server-side (Safari ITP)', () => {
  it('matches Supabase session cookies, including chunks, and nothing else', () => {
    expect(isAuthCookie('sb-abcdefghijklmnop-auth-token')).toBe(true);
    expect(isAuthCookie('sb-abcdefghijklmnop-auth-token.0')).toBe(true);
    expect(isAuthCookie('sb-abcdefghijklmnop-auth-token.1')).toBe(true);
    expect(isAuthCookie('sb-abcdefghijklmnop-auth-token-code-verifier')).toBe(false);
    expect(isAuthCookie('cm_src')).toBe(false);
  });
  it('keeps them for 400 days, readable by the browser client, lax', () => {
    const o = persistentCookieOptions(true);
    expect(o.maxAge).toBe(AUTH_COOKIE_MAX_AGE);
    expect(AUTH_COOKIE_MAX_AGE).toBe(400 * 24 * 60 * 60);
    expect(o.httpOnly).toBe(false);
    expect(o.sameSite).toBe('lax');
    expect(o.path).toBe('/');
    expect(o.secure).toBe(true);
  });
});
