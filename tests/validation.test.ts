import { describe, expect, it } from 'vitest';
import {
  feedbackSchema,
  firstError,
  listFilterSchema,
  messageSchema,
  profileSchema,
  recruitmentSchema,
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

const baseRecruit = {
  title: '21時からまったり',
  purpose: 'enjoy',
  startsAtLocal: '2026-10-01T21:00',
  durationMin: '120',
  capacity: '3',
  minRank: '',
  vc: 'any',
  tags: ['beginner_welcome'],
  note: '',
  roomCode: '',
  src: 'guild',
};

describe('recruitmentSchema', () => {
  it('parses JST local input into UTC and computes end', () => {
    const r = recruitmentSchema.parse(baseRecruit);
    expect(r.startsAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(r.endsAt.toISOString()).toBe('2026-10-01T14:00:00.000Z');
    expect(r.capacity).toBe(3);
    expect(r.minRank).toBeNull();
    expect(r.roomCode).toBeNull();
    expect(r.src).toBe('guild');
  });
  it('rejects capacity out of range', () => {
    expect(recruitmentSchema.safeParse({ ...baseRecruit, capacity: '1' }).success).toBe(false);
    expect(recruitmentSchema.safeParse({ ...baseRecruit, capacity: '7' }).success).toBe(false);
  });
  it('rejects non-listed duration', () => {
    expect(recruitmentSchema.safeParse({ ...baseRecruit, durationMin: '999' }).success).toBe(false);
  });
  it('rejects URL in title or note', () => {
    expect(recruitmentSchema.safeParse({ ...baseRecruit, title: 'discord.gg/xxx' }).success).toBe(false);
    expect(recruitmentSchema.safeParse({ ...baseRecruit, note: 'https://a.b' }).success).toBe(false);
  });
  it('rejects bad dates and room codes', () => {
    expect(recruitmentSchema.safeParse({ ...baseRecruit, startsAtLocal: '2026-02-31T21:00' }).success).toBe(false);
    expect(recruitmentSchema.safeParse({ ...baseRecruit, startsAtLocal: 'tomorrow' }).success).toBe(false);
    expect(recruitmentSchema.safeParse({ ...baseRecruit, roomCode: '12 34' }).success).toBe(false);
    expect(recruitmentSchema.parse({ ...baseRecruit, roomCode: '12345' }).roomCode).toBe('12345');
  });
  it('drops invalid src silently', () => {
    expect(recruitmentSchema.parse({ ...baseRecruit, src: '<script>' }).src).toBeNull();
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
  it('list filters fall back to all', () => {
    expect(listFilterSchema.parse({ day: 'yesterday', purpose: 'gender' })).toEqual({ day: 'all', purpose: 'all' });
    expect(listFilterSchema.parse({ day: 'today', purpose: 'rank' })).toEqual({ day: 'today', purpose: 'rank' });
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
