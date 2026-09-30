import { describe, expect, it } from 'vitest';
import { displayNameFromMetadata } from '@/lib/display-name';

describe('displayNameFromMetadata', () => {
  it('prefers Discord global_name', () => {
    expect(
      displayNameFromMetadata({ custom_claims: { global_name: 'こんぱす太郎' }, full_name: 'taro_1234', name: 'taro_1234#0' }),
    ).toBe('こんぱす太郎');
  });
  it('falls back to full_name, then name without #0', () => {
    expect(displayNameFromMetadata({ full_name: 'taro', name: 'x#0' })).toBe('taro');
    expect(displayNameFromMetadata({ name: 'taro_1234#0' })).toBe('taro_1234');
  });
  it('works for X metadata', () => {
    expect(displayNameFromMetadata({ user_name: 'compass_fan' })).toBe('compass_fan');
  });
  it('skips URLs and empty values, trims to 20 chars', () => {
    expect(displayNameFromMetadata({ full_name: 'discord.gg/abc', name: 'ok_name' })).toBe('ok_name');
    expect(displayNameFromMetadata({ full_name: '   ' })).toBe('');
    expect(displayNameFromMetadata(null)).toBe('');
    expect(Array.from(displayNameFromMetadata({ full_name: 'あ'.repeat(30) }))).toHaveLength(20);
  });
});
