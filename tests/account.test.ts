import { describe, expect, it } from 'vitest';
import {
  AUTH_EMAIL_DOMAIN,
  RECOVERY_ALPHABET,
  authEmailFor,
  formatRecoveryCode,
  isSyntheticEmail,
  isValidLoginId,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from '@/lib/account';
import { recoverSchema, signupSchema } from '@/lib/validation/schemas';

// GoTrue (github.com/supabase/auth) internal/mailer/validateclient/validateclient.go の拒否リスト
const GOTRUE_INVALID_SUFFIXES = ['.test', '.example', '.invalid', '.local', '.localhost'];
const GOTRUE_INVALID_HOSTS = ['test', 'example', 'invalid', 'local', 'localhost', 'test.com', 'example.com', 'example.net', 'example.org', 'gamil.com', 'gamai.com', 'anonymous.com', 'email.com'];
// github.com/badoux/checkmail の ValidateFormat と同じ正規表現 (GoTrue の登録時チェック)
const CHECKMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

describe('synthetic auth email', () => {
  it('passes GoTrue format validation for every valid login id shape', () => {
    for (const id of ['abc', 'Player_One', '___', 'a1_b2_c3_d4_e5_f6_g7', '123']) {
      expect(CHECKMAIL_FORMAT.test(authEmailFor(id)), id).toBe(true);
    }
  });
  it('uses a domain that GoTrue extended validation does not reject statically', () => {
    expect(GOTRUE_INVALID_HOSTS).not.toContain(AUTH_EMAIL_DOMAIN);
    for (const s of GOTRUE_INVALID_SUFFIXES) expect(AUTH_EMAIL_DOMAIN.endsWith(s)).toBe(false);
    expect(AUTH_EMAIL_DOMAIN).toContain('.');
  });
  it('is case-insensitive and stable', () => {
    expect(authEmailFor('Player_One')).toBe(`player_one@${AUTH_EMAIL_DOMAIN}`);
    expect(authEmailFor(' player_one ')).toBe(authEmailFor('PLAYER_ONE'));
    expect(isSyntheticEmail(authEmailFor('abc'))).toBe(true);
    expect(isSyntheticEmail('someone@gmail.com')).toBe(false);
  });
  it('refuses invalid ids', () => {
    expect(() => authEmailFor('ab')).toThrow();
    expect(() => authEmailFor('a@b')).toThrow();
    expect(isValidLoginId('あいう')).toBe(false);
    expect(isValidLoginId('a'.repeat(21))).toBe(false);
    expect(isValidLoginId('a'.repeat(20))).toBe(true);
  });
});

describe('recovery code', () => {
  it('has 32 unambiguous symbols', () => {
    expect(new Set(RECOVERY_ALPHABET).size).toBe(32);
    for (const ch of '01IO') expect(RECOVERY_ALPHABET).not.toContain(ch);
  });
  it('normalizes spacing, hyphens, case and full-width input', () => {
    expect(normalizeRecoveryCode('abcd-efgh jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeRecoveryCode('ＡＢＣＤ－ＥＦＧＨ－ＪＫＭＮ－ＰＱＲＳ')).toBe('ABCDEFGHJKMNPQRS');
    expect(isValidRecoveryCode('ABCDEFGHJKMNPQRS')).toBe(true);
    expect(isValidRecoveryCode('ABCDEFGHJKMNPQR0')).toBe(false);
    expect(isValidRecoveryCode('ABCD')).toBe(false);
    expect(formatRecoveryCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
  });
});

describe('signup / recover schemas', () => {
  const base = { loginId: 'Taro_01', password: 'correct horse', displayName: 'たろう', rankBand: 's4_6', playRoles: ['tank'], agreeTerms: true, src: null };
  it('accepts a valid signup and lowercases the id', () => {
    const r = signupSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.loginId).toBe('taro_01');
  });
  it('rejects short passwords, bad ids and missing consent', () => {
    expect(signupSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: 'x'.repeat(73) }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, loginId: 'ta' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, loginId: 'たろう' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, agreeTerms: false }).success).toBe(false);
  });
  it('recover normalizes the code', () => {
    const r = recoverSchema.safeParse({ loginId: 'taro_01', code: 'abcd efgh jkmn pqrs', password: 'new password' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('ABCDEFGHJKMNPQRS');
  });
});
