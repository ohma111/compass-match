// 開発用プレビュー (/dev/preview) だけで使うダミーデータ。本番の画面からは読み込まない。
// 実在の人物・公式素材とは関係ない。時刻はプレビューを開いた時刻からの相対で作る。
import type { MemberContact, Message, Participation, Profile, Recruitment } from './types';
import type { JoinState } from './capacity';

export const ME_ID = 'f0000000-0000-4000-8000-000000000001';

const P = (id: string, display_name: string, rank_band: Profile['rank_band'], play_roles: Profile['play_roles'] = []) => ({
  id,
  display_name,
  rank_band,
  play_roles,
});

export const people = {
  me: P(ME_ID, 'ゆずぽん', 's4_6', ['tank', 'gunner']),
  taro: P('f0000000-0000-4000-8000-000000000002', 'たろう', 's4_6', ['attacker']),
  mio: P('f0000000-0000-4000-8000-000000000003', 'みお', 's1_3', ['tank']),
  kei: P('f0000000-0000-4000-8000-000000000004', 'Kei', 's10p', ['gunner', 'sprinter']),
  shiro: P('f0000000-0000-4000-8000-000000000005', 'しろくま', 'ba', ['sprinter']),
  natsu: P('f0000000-0000-4000-8000-000000000006', 'なつめ', 's7_9', ['attacker', 'gunner']),
  rin: P('f0000000-0000-4000-8000-000000000007', 'りん', 's1_3', []),
};

type Person = (typeof people)[keyof typeof people];

const min = 60_000;
function at(now: Date, offsetMin: number): string {
  return new Date(now.getTime() + offsetMin * min).toISOString();
}
/** JST の今日 hh:mm (過ぎていれば明日) */
function jstClock(now: Date, h: number, m = 0): Date {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const d = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), h, m) - 9 * 3600_000;
  return new Date(d <= now.getTime() ? d + 24 * 3600_000 : d);
}

function rec(
  now: Date,
  id: number,
  owner: Person,
  partial: Partial<Recruitment> & Pick<Recruitment, 'title' | 'purpose' | 'capacity' | 'approved_count'>,
  startMin: number,
): Recruitment {
  const starts = at(now, startMin);
  return {
    id: `e0000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    owner_id: owner.id,
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + 60 * min).toISOString(),
    min_rank: null,
    vc: 'any',
    tags: [],
    note: '',
    status: partial.approved_count >= partial.capacity - 1 ? 'full' : 'open',
    join_mode: 'instant',
    hidden_at: null,
    created_at: at(now, -20),
    owner: { id: owner.id, display_name: owner.display_name, rank_band: owner.rank_band },
    ...partial,
  };
}

export function feed(now: Date): Recruitment[] {
  const at22 = (jstClock(now, 22).getTime() - now.getTime()) / min;
  const at23 = (jstClock(now, 23).getTime() - now.getTime()) / min;
  return [
    rec(now, 1, people.taro, { title: 'ランク S4〜 あと1人', purpose: 'rank', capacity: 3, approved_count: 1, min_rank: 's4_6', vc: 'on', tags: ['serious'] }, 8),
    rec(now, 2, people.mio, { title: 'まったりバトアリ、初心者さんも', purpose: 'enjoy', capacity: 3, approved_count: 0, tags: ['beginner_welcome', 'relaxed'], vc: 'off' }, -12),
    rec(now, 3, people.kei, { title: '大会前の連携練習 タンクほしい', purpose: 'tournament', capacity: 3, approved_count: 1, join_mode: 'approval', vc: 'on', tags: ['practice'], min_rank: 's7_9' }, at22),
    rec(now, 4, people.shiro, { title: 'カスタム 3vs3 やりたい人', purpose: 'custom', capacity: 6, approved_count: 3, tags: ['relaxed', 'quiet_ok'] }, 40),
    rec(now, 5, people.natsu, { title: 'エンジョイ 22時から', purpose: 'enjoy', capacity: 3, approved_count: 2, tags: ['relaxed'] }, at22),
    rec(now, 6, people.rin, { title: 'ランク 聞き専OK あと2人', purpose: 'rank', capacity: 3, approved_count: 0, tags: ['quiet_ok', 'considerate'] }, at23),
  ];
}

export function homeStates(): Record<string, JoinState> {
  return {};
}

/** 募集詳細: たろうのランク募集 (あと1人) */
export function detail(now: Date, joined: boolean) {
  const base = feed(now)[0];
  const r: Recruitment = joined ? { ...base, approved_count: 2, status: 'full' } : base;
  const part = (id: number, who: Person, status: Participation['status']): Participation => ({
    id: `d0000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    recruitment_id: r.id,
    user_id: who.id,
    status,
    created_at: at(now, -10 + id),
    profile: { id: who.id, display_name: who.display_name, rank_band: who.rank_band, play_roles: who.play_roles, vc: 'yes', tags: [] },
  });
  const participations = [part(1, people.mio, 'approved'), ...(joined ? [part(2, people.me, 'approved')] : [])];
  const messages: Message[] = joined
    ? [
        { id: 'c1', recruitment_id: r.id, user_id: people.taro.id, body: 'よろしくです! 部屋立てました', created_at: at(now, -3) },
        { id: 'c2', recruitment_id: r.id, user_id: people.mio.id, body: 'よろしくお願いします〜 タンク出します', created_at: at(now, -2) },
        { id: 'c3', recruitment_id: r.id, user_id: people.me.id, body: 'よろしく! ガンナーでいきます', created_at: at(now, -1) },
      ]
    : [];
  const contacts: MemberContact[] = joined
    ? [{ user_id: people.taro.id, display_name: people.taro.display_name, is_owner: true, contact_discord: 'taro_compass', contact_x: null, contact_ingame: null }]
    : [];
  return {
    r,
    participations,
    myState: (joined ? 'approved' : 'none') as JoinState,
    roomCode: joined ? '48213' : null,
    messages,
    contacts,
  };
}

export function meProfile(now: Date): Profile {
  return {
    ...people.me,
    characters: [],
    purposes: ['rank', 'enjoy'],
    vc: 'listen',
    tags: ['relaxed'],
    bio: '',
    hidden_at: null,
    suspended_at: null,
    banned_at: null,
    created_at: at(now, -60 * 24 * 3),
  };
}

export function myRecruitments(now: Date): Recruitment[] {
  return [rec(now, 9, people.me, { title: 'エンジョイ あと2人', purpose: 'enjoy', capacity: 3, approved_count: 0, tags: ['relaxed'] }, 25)];
}
