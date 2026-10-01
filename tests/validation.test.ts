import { describe, expect, it } from 'vitest';
import {
  buildRecruitment,
  feedbackSchema,
  firstError,
  listFilterSchema,
  messageSchema,
  onboardingSchema,
  profileSchema,
  reportSchema,
  validateStartWindow,
} from '@/lib/validation/schemas';
import { safeNext } from '@/lib/safe-next';
import { sanitizeSrc } from '@/lib/src-param';
import { toUserMessage } from '@/lib/db-error';

const baseProfile = {
  displayName: ' テスト ',
  rankBand: 's4_6',
  playRoles: ['attacker', 'attacker', 'tank'],
  characters: ['ジャスティス', '', '  '],
  purposes: ['enjoy'],
  vc: 'listen',
  tags: ['relaxed'],
  bio: 'よろしく',
  contactDiscord: '',
  contactX: '@my_id',
  contactIngame: '',
  agreeTerms: true,
  src: 'X',
};

describe('profileSchema', () => {
  it('accepts and normalizes valid input', () => {
    const r = profileSchema.parse(baseProfile);
    expect(r.displayName).toBe('テスト');
    expect(r.playRoles).toEqual(['attacker', 'tank']);
    expect(r.characters).toEqual(['ジャスティス']);
    expect(r.contactDiscord).toBeNull();
    expect(r.contactX).toBe('my_id');
    expect(r.contactIngame).toBeNull();
    expect(r.src).toBe('x');
  });
  it('rejects URL in bio', () => {
    const r = profileSchema.safeParse({ ...baseProfile, bio: '詳しくは example.com へ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toBe('URLは入力できません');
  });
  it('rejects bio over 200 chars', () => {
    expect(profileSchema.safeParse({ ...baseProfile, bio: 'あ'.repeat(201) }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, bio: 'あ'.repeat(200) }).success).toBe(true);
  });
  it('rejects more than 3 characters', () => {
    expect(profileSchema.safeParse({ ...baseProfile, characters: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });
  it('rejects empty display name and unknown enums', () => {
    expect(profileSchema.safeParse({ ...baseProfile, displayName: '   ' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, rankBand: 'god' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, tags: ['female_only'] }).success).toBe(false);
  });
  it('validates contact formats', () => {
    expect(profileSchema.safeParse({ ...baseProfile, contactDiscord: 'Bad Name!' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, contactX: 'this_is_way_too_long_id' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, contactIngame: 'https://x.test' }).success).toBe(false);
  });
});

describe('onboardingSchema', () => {
  const base = { displayName: ' こんぱす ', rankBand: 's1_3', playRoles: ['tank', 'tank'], agreeTerms: true, src: 'guild' };
  it('accepts the one-screen signup', () => {
    const r = onboardingSchema.parse(base);
    expect(r.displayName).toBe('こんぱす');
    expect(r.playRoles).toEqual(['tank']);
    expect(r.src).toBe('guild');
  });
  it('roles are optional, rank and consent are required', () => {
    expect(onboardingSchema.safeParse({ ...base, playRoles: [] }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, rankBand: '' }).success).toBe(false);
    const r = onboardingSchema.safeParse({ ...base, agreeTerms: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toMatch(/同意/);
  });
  it('rejects URLs in the display name', () => {
    expect(onboardingSchema.safeParse({ ...base, displayName: 'x.com/me' }).success).toBe(false);
  });
});

// JST 20:42
const NOW = new Date('2026-10-01T11:42:00Z');
const baseRecruit = {
  purpose: 'rank',
  startKey: 'h21',
  capacity: '2',
  joinMode: 'instant',
  minRank: 's4_6',
  vc: 'on',
  tags: ['serious', 'serious'],
  title: '',
  roomCode: '',
  src: 'guild',
};

function build(over: Record<string, unknown> = {}, now = NOW) {
  return buildRecruitment({ ...baseRecruit, ...over }, now);
}

describe('buildRecruitment (tap-based create)', () => {
  it('resolves the start chip in JST, sets end = start + 1h and auto title', () => {
    const r = build();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.startsAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(r.data.endsAt.toISOString()).toBe('2026-10-01T13:00:00.000Z');
    expect(r.data.title).toBe('ランク S4〜の募集');
    expect(r.data.capacity).toBe(2);
    expect(r.data.joinMode).toBe('instant');
    expect(r.data.tags).toEqual(['serious']);
    expect(r.data.roomCode).toBeNull();
    expect(r.data.src).toBe('guild');
  });
  it('keeps a custom title (ひとこと)', () => {
    const r = build({ title: '  1戦だけ!  ' });
    expect(r.ok && r.data.title).toBe('1戦だけ!');
  });
  it('enforces capacity per purpose', () => {
    expect(build({ capacity: '3' }).ok).toBe(true);
    const bad = build({ capacity: '4' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/あと2人/);
    expect(build({ purpose: 'custom', capacity: '6' }).ok).toBe(true);
    expect(build({ purpose: 'custom', capacity: '7' }).ok).toBe(false);
    expect(build({ capacity: '1' }).ok).toBe(false);
  });
  it('validates join mode (instant / approval only)', () => {
    expect(build({ joinMode: 'approval' }).ok).toBe(true);
    expect(build({ joinMode: 'auto' }).ok).toBe(false);
    expect(build({ joinMode: undefined }).ok).toBe(false);
  });
  it('rejects a fixed chip that has already passed (no rollover to tomorrow)', () => {
    const r = build({ startKey: 'h21' }, new Date('2026-10-01T12:45:00Z')); // JST 21:45
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/過ぎています/);
  });
  it('custom time rolls past times to the next day', () => {
    const r = build({ startKey: 'custom', startTime: '00:30' });
    expect(r.ok && r.data.startsAt.toISOString()).toBe('2026-10-01T15:30:00.000Z');
    expect(build({ startKey: 'custom', startTime: '' }).ok).toBe(false);
    expect(build({ startKey: 'tomorrow' }).ok).toBe(false);
  });
  it('rejects URLs in the title and bad room codes', () => {
    expect(build({ title: 'discord.gg/xxx' }).ok).toBe(false);
    expect(build({ title: 'あ'.repeat(41) }).ok).toBe(false);
    expect(build({ roomCode: '12 34' }).ok).toBe(false);
    const ok = build({ roomCode: '12345' });
    expect(ok.ok && ok.data.roomCode).toBe('12345');
  });
  it('drops invalid src and unknown vc falls back to any', () => {
    const r = build({ src: '<script>', vc: 'loud' });
    expect(r.ok && r.data.src).toBeNull();
    expect(r.ok && r.data.vc).toBe('any');
  });
});

describe('validateStartWindow', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  it('allows near future and small past grace', () => {
    expect(validateStartWindow(new Date('2026-09-30T11:45:00Z'), now)).toBeNull();
    expect(validateStartWindow(new Date('2026-10-06T12:00:00Z'), now)).toBeNull();
  });
  it('rejects too old or too far', () => {
    expect(validateStartWindow(new Date('2026-09-30T11:00:00Z'), now)).toMatch(/過去/);
    expect(validateStartWindow(new Date('2026-10-08T12:00:00Z'), now)).toMatch(/7日/);
  });
});

describe('messageSchema', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  it('accepts up to 300 chars', () => {
    expect(messageSchema.safeParse({ recruitmentId: id, body: 'あ'.repeat(300) }).success).toBe(true);
    expect(messageSchema.safeParse({ recruitmentId: id, body: 'あ'.repeat(301) }).success).toBe(false);
  });
  it('rejects empty, URLs and control chars', () => {
    expect(messageSchema.safeParse({ recruitmentId: id, body: '   ' }).success).toBe(false);
    const u = messageSchema.safeParse({ recruitmentId: id, body: 'みて https://x.test' });
    expect(u.success).toBe(false);
    if (!u.success) expect(firstError(u.error)).toBe('URLは送信できません');
    expect(messageSchema.safeParse({ recruitmentId: id, body: 'a\u0007b' }).success).toBe(false);
  });
  it('rejects invalid recruitment id', () => {
    expect(messageSchema.safeParse({ recruitmentId: 'nope', body: 'hi' }).success).toBe(false);
  });
});

describe('report / feedback / filters', () => {
  it('requires a reason', () => {
    expect(reportSchema.safeParse({ targetType: 'user', targetId: '10000000-0000-4000-8000-000000000001', reason: ' ' }).success).toBe(false);
    expect(reportSchema.safeParse({ targetType: 'dm', targetId: '10000000-0000-4000-8000-000000000001', reason: 'x' }).success).toBe(false);
  });
  it('feedback length and page', () => {
    expect(feedbackSchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false);
    expect(feedbackSchema.parse({ body: 'ok', page: 'https://evil' }).page).toBeNull();
    expect(feedbackSchema.parse({ body: 'ok', page: '/recruitments' }).page).toBe('/recruitments');
  });
  it('feed filters fall back to all', () => {
    expect(listFilterSchema.parse({ purpose: 'gender', soon: 'yes' })).toEqual({ purpose: 'all', soon: false });
    expect(listFilterSchema.parse({ purpose: 'rank', soon: '1' })).toEqual({ purpose: 'rank', soon: true });
    expect(listFilterSchema.parse({})).toEqual({ purpose: 'all', soon: false });
  });
});

describe('helpers', () => {
  it('safeNext blocks open redirects', () => {
    expect(safeNext('/recruitments/1')).toBe('/recruitments/1');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext(null, '/x')).toBe('/x');
  });
  it('sanitizeSrc', () => {
    expect(sanitizeSrc('Guild')).toBe('guild');
    expect(sanitizeSrc('yt_short-1')).toBe('yt_short-1');
    expect(sanitizeSrc('a b')).toBeNull();
    expect(sanitizeSrc('x'.repeat(33))).toBeNull();
    expect(sanitizeSrc(123)).toBeNull();
  });
  it('toUserMessage hides internal errors', () => {
    expect(toUserMessage({ code: 'P0429', message: '連続投稿はできません' })).toBe('連続投稿はできません');
    expect(toUserMessage({ code: '23514', message: 'new row violates check constraint "x"' })).toMatch(/URL/);
    expect(toUserMessage({ code: 'XX000', message: 'internal detail' })).not.toMatch(/internal/);
  });
});
