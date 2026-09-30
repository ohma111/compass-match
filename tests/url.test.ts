import { describe, expect, it } from 'vitest';
import { containsUrl } from '@/lib/validation/url';

describe('containsUrl', () => {
  it.each([
    'https://example.com',
    'http://foo.bar/baz',
    'ここ見て example.com',
    'discord.gg/abcdef',
    'bit.ly/xyz',
    'ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ',
    'example . com',
    'example。com',
    'EXAMPLE.JP',
    'data:image/png;base64,AAAA',
    'ftp://files',
    'twitter.com/foo',
    'x.com/foo',
  ])('detects %s', (s) => {
    expect(containsUrl(s)).toBe(true);
  });

  it.each([
    'よろしくお願いします!',
    '21時からバトアリ行きましょう',
    '部屋番号は12345です',
    'S4.5くらい',
    'ver.2.0 の話',
    'また明日。com系の話はしない',
    'ジャスティス使います',
    '',
  ])('allows %s', (s) => {
    expect(containsUrl(s)).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(containsUrl(null)).toBe(false);
    expect(containsUrl(undefined)).toBe(false);
  });
});
