import { afterEach, describe, expect, it } from 'vitest';
import { features, getSupabaseEnv, MissingEnvError, parseBoolFlag, parseIntSetting } from '@/lib/env';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('env', () => {
  it('throws a clear error when Supabase env is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabaseEnv()).toThrow(MissingEnvError);
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  it('available-now flag defaults to OFF', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_AVAILABLE_NOW;
    expect(features.availableNow).toBe(false);
    process.env.NEXT_PUBLIC_FEATURE_AVAILABLE_NOW = 'true';
    expect(features.availableNow).toBe(true);
  });
  it('threshold defaults to 30', () => {
    delete process.env.NOW_LIST_MIN_USERS;
    expect(features.nowListMinUsers).toBe(30);
    expect(parseIntSetting('abc', 30)).toBe(30);
    expect(parseBoolFlag('1')).toBe(true);
    expect(parseBoolFlag('no')).toBe(false);
  });
});
