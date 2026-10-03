import { describe, expect, it } from 'vitest';
import {
  accountKindOf,
  handleFromEmail,
  isTransferEmail,
  isValidTransferCode,
  newTransferCode,
  normalizeTransferCode,
  transferCodeGroups,
  transferCredentials,
} from '@/lib/transfer';
import { AUTH_EMAIL_DOMAIN, authEmailFor, LOGIN_ID_PATTERN } from '@/lib/account';

const CHECKMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

describe('v4 transfer code', () => {
  it('generates valid 20-char codes that map to a GoTrue-valid address and an 12-char password', () => {
    for (let i = 0; i < 50; i++) {
      const code = newTransferCode();
      expect(isValidTransferCode(code)).toBe(true);
      const { email, password } = transferCredentials(code);
      expect(CHECKMAIL_FORMAT.test(email)).toBe(true);
      expect(email.endsWith(`@${AUTH_EMAIL_DOMAIN}`)).toBe(true);
      expect(password).toHaveLength(12);
      expect(isTransferEmail(email)).toBe(true);
    }
  });
  it('never collides with v3 user-ID addresses', () => {
    const { email } = transferCredentials(newTransferCode());
    const local = email.split('@')[0];
    expect(LOGIN_ID_PATTERN.test(local)).toBe(false); // 「.」はユーザーIDに使えない
    expect(isTransferEmail(authEmailFor('taro_01'))).toBe(false);
  });
  it('keeps the address part when re-issued', () => {
    const first = newTransferCode();
    const { email } = transferCredentials(first);
    const second = newTransferCode(email);
    expect(second.slice(0, 8)).toBe(first.slice(0, 8));
    expect(second.slice(8)).not.toBe(first.slice(8));
    expect(handleFromEmail(email)).toBe(first.slice(0, 8));
  });
  it('accepts sloppy input (spaces, hyphens, lower case, full-width)', () => {
    const code = 'ABCDE2345FGHJK6789MN';
    expect(normalizeTransferCode('abcde-2345f ghjk6-789mn')).toBe(code);
    expect(normalizeTransferCode('ＡＢＣＤＥ－２３４５Ｆ－ＧＨＪＫ６－７８９ＭＮ')).toBe(code);
    expect(transferCodeGroups(code)).toEqual(['ABCDE', '2345F', 'GHJK6', '789MN']);
    expect(isValidTransferCode('ABCDE')).toBe(false);
  });
  it('classifies accounts', () => {
    expect(accountKindOf({ is_anonymous: true })).toBe('anonymous');
    expect(accountKindOf({ email: 't.abcd2345@example.edu' })).toBe('transfer');
    expect(accountKindOf({ email: 'taro_01@example.edu' })).toBe('login-id');
    expect(accountKindOf({ email: 'someone@gmail.com' })).toBe('oauth');
  });
});
