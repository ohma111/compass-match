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
  rankBand: 's6',
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
    if (!r.success) expect(firstError(r.error)).toBe('URLは使えません');
  });
  it('rejects bio over 100 chars and banned words', () => {
    expect(profileSchema.safeParse({ ...baseProfile, bio: 'あ'.repeat(101) }).success).toBe(false);
    expect(profileSchema.safeParse({ ...baseProfile, bio: 'あ'.repeat(100) }).success).toBe(true);
    expect(profileSchema.safeParse({ ...baseProfile, bio: 'インスタやってます' }).success).toBe(false);
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
  const base = { displayName: ' こんぱす ', rankBand: 's3', playRoles: ['tank', 'tank'], agreeTerms: true, src: 'guild' };
  it('accepts the one-screen signup', () => {
    const r = onboardingSchema.parse(base);
    expect(r.displayName).toBe('こんぱす');
    expect(r.playRoles).toEqual(['tank']);
    expect(r.src).toBe('guild');
  });
  it('roles and rank are optional (rank is asked when joining), consent is required', () => {
    expect(onboardingSchema.safeParse({ ...base, playRoles: [] }).success).toBe(true);
    const noRank = onboardingSchema.safeParse({ ...base, rankBand: '' });
    expect(noRank.success && noRank.data.rankBand).toBeNull();
    expect(onboardingSchema.safeParse({ ...base, rankBand: 's10' }).success).toBe(false);
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
  startKey: 'slot',
  startDay: 'today',
  startTime: '21:00',
  stance: 'win',
  capacity: '2',
  joinMode: 'instant',
  minRank: 's5',
  vc: 'on',
  tags: ['serious', 'serious'],
  title: '',
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
    expect(r.data.title).toBe('バトルアリーナ S5↑の募集');
    expect(r.data.capacity).toBe(2);
    expect(r.data.joinMode).toBe('instant');
    expect(r.data.tags).toEqual(['serious']);
    expect(r.data.stance).toBe('win');
    expect(r.data.src).toBe('guild');
  });
  it('募集の時間は 1・2・3時間から選べ、ほかの値は1時間になる', () => {
    const two = build({ duration: '120' });
    expect(two.ok && two.data.endsAt.toISOString()).toBe('2026-10-01T14:00:00.000Z');
    const bad = build({ duration: '600' });
    expect(bad.ok && bad.data.endsAt.toISOString()).toBe('2026-10-01T13:00:00.000Z');
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
    expect(build({ purpose: 'challenge', capacity: '3' }).ok).toBe(true);
    expect(build({ purpose: 'challenge', capacity: '4' }).ok).toBe(false);
    expect(build({ capacity: '1' }).ok).toBe(false);
  });
  it('validates join mode (instant / approval only)', () => {
    expect(build({ joinMode: 'approval' }).ok).toBe(true);
    expect(build({ joinMode: 'auto' }).ok).toBe(false);
    expect(build({ joinMode: undefined }).ok).toBe(false);
  });
  it('rejects a slot that has already passed (no rollover to tomorrow)', () => {
    const r = build({}, new Date('2026-10-01T12:45:00Z')); // JST 21:45
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/過ぎています/);
  });
  it('tomorrow slot, 15 minute steps only, stance required', () => {
    const r = build({ startDay: 'tomorrow', startTime: '00:30' });
    expect(r.ok && r.data.startsAt.toISOString()).toBe('2026-10-01T15:30:00.000Z');
    expect(build({ startTime: '' }).ok).toBe(false);
    expect(build({ startTime: '21:10' }).ok).toBe(false);
    expect(build({ stance: '' }).ok).toBe(false);
  });
  it('rejects URLs and banned words in the title', () => {
    expect(build({ title: 'discord.gg/xxx' }).ok).toBe(false);
    expect(build({ title: 'あ'.repeat(41) }).ok).toBe(false);
    expect(build({ title: 'ライン交換できる人' }).ok).toBe(false);
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
  it('accepts up to 50 chars and rejects banned words', () => {
    expect(messageSchema.safeParse({ recruitmentId: id, body: 'あ'.repeat(50) }).success).toBe(true);
    expect(messageSchema.safeParse({ recruitmentId: id, body: 'あ'.repeat(51) }).success).toBe(false);
    expect(messageSchema.safeParse({ recruitmentId: id, body: '何歳ですか' }).success).toBe(false);
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
    const base = { open: false, eligible: false, vc: undefined, stance: undefined, sort: 'start' };
    expect(listFilterSchema.parse({ purpose: 'gender', soon: 'yes' })).toEqual({ ...base, purpose: 'all', soon: false });
    expect(listFilterSchema.parse({ purpose: 'rank', soon: '1' })).toEqual({ ...base, purpose: 'rank', soon: true });
    expect(listFilterSchema.parse({})).toEqual({ ...base, purpose: 'all', soon: false });
    expect(listFilterSchema.parse({ open: '1', vc: 'on', stance: 'x', sort: 'evil' })).toEqual({ ...base, purpose: 'all', soon: false, open: true, vc: 'on' });
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
    expect(toUserMessage({ code: '23514', message: 'new row violates check constraint "x"' })).toMatch(/使用できない/);
    expect(toUserMessage({ code: 'XX000', message: 'internal detail' })).not.toMatch(/internal/);
  });
});

describe('v4.1 rank bands', () => {
  it('has exactly the 4 new bands and rejects the old codes', async () => {
    const { RANK_BANDS, RANK_LABELS } = await import('@/lib/constants');
    expect([...RANK_BANDS]).toEqual(['a', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']);
    expect(RANK_LABELS.s9).toBe('S9');
    expect(RANK_LABELS.a).toBe('A以下');
    const { onboardingSchema } = await import('@/lib/validation/schemas');
    for (const old of ['fc', 'ba', 's1_3', 's4_6', 's7_9', 's10p', 'fa', 's1_4', 's5_7', 's8p', 's10', 'b', 'f']) {
      expect(onboardingSchema.safeParse({ displayName: 'a', rankBand: old, playRoles: [], agreeTerms: true, src: null }).success).toBe(false);
    }
  });
});
