'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, Gamepad2, Medal, Hand, Smile, Sparkles, Swords, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { createRecruitmentAction } from '@/app/actions';
import {
  JOIN_MODES,
  LIMITS,
  MOOD_TAGS,
  MOOD_TAG_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  RANK_BANDS,
  RANK_BANDS_DESC,
  RANK_MIN_LABELS,
  RECRUIT_VC,
  STANCES,
  STANCE_LABELS,
  type Stance,
  type JoinMode,
  type MoodTag,
  type Purpose,
  type RankBand,
  type RecruitVc,
} from '@/lib/constants';
import { capacityOptions, clampCapacity } from '@/lib/capacity';
import { autoEnd, autoTitle, nextSlot, resolveStart, selectableHours, slotAt, startPreview, START_DAYS, START_KEYS, SLOT_MINUTES, type StartDay, type StartKey } from '@/lib/recruit';
import { formatJstTime } from '@/lib/time';
import { containsUrl } from '@/lib/validation/url';
import { takeIntent } from '@/lib/intent';
import { Lineup, type Seat } from '@/components/Lineup';
import { RankPicker } from '@/components/RankPicker';
import { useEnsureProfile } from '@/components/ProfileSheet';
import { useEnsureRank } from '@/components/RankSheet';

const PURPOSE_ICON: Record<Purpose, LucideIcon> = { rank: Trophy, enjoy: Sparkles, tournament: Swords, custom: Gamepad2, challenge: Medal };
const VC_SHORT: Record<RecruitVc, string> = { on: 'あり', any: 'どちらでも', off: 'なし' };
const STANCE_ICON: Record<Stance, LucideIcon> = { win: Flame, fun: Smile };
/** 遊び方 (本気 / 楽しく) と重なるタグは選ばせない */
const PICK_TAGS = MOOD_TAGS.filter((t) => t !== 'serious' && t !== 'relaxed');

const LAST_KEY = 'cm_last_recruit';
const DRAFT_KEY = 'cm_recruit_draft';

interface Choices {
  purpose: Purpose;
  startKey: StartKey;
  startDay: StartDay;
  startTime: string;
  stance: Stance | '';
  capacity: number;
  joinMode: JoinMode;
  minRank: RankBand | '';
  vc: RecruitVc;
  tags: MoodTag[];
}
interface Draft extends Choices {
  title: string;
}

const DEFAULTS: Choices = {
  purpose: 'enjoy',
  startKey: 'now',
  startDay: 'today',
  startTime: '',
  stance: '',
  capacity: 3,
  joinMode: 'instant',
  minRank: '',
  vc: 'any',
  tags: [],
};

/** localStorage の値を検証して取り込む (壊れた値・古い値は無視) */
function sanitize(raw: unknown): Partial<Draft> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Draft> = {};
  if (PURPOSES.includes(r.purpose as Purpose)) out.purpose = r.purpose as Purpose;
  if (START_KEYS.includes(r.startKey as StartKey)) out.startKey = r.startKey as StartKey;
  if (START_DAYS.includes(r.startDay as StartDay)) out.startDay = r.startDay as StartDay;
  if (typeof r.startTime === 'string' && /^\d{2}:\d{2}$/.test(r.startTime)) out.startTime = r.startTime;
  if (STANCES.includes(r.stance as Stance)) out.stance = r.stance as Stance;
  if (typeof r.capacity === 'number') out.capacity = r.capacity;
  if (JOIN_MODES.includes(r.joinMode as JoinMode)) out.joinMode = r.joinMode as JoinMode;
  if (r.minRank === '' || RANK_BANDS.includes(r.minRank as RankBand)) out.minRank = r.minRank as RankBand | '';
  if (RECRUIT_VC.includes(r.vc as RecruitVc)) out.vc = r.vc as RecruitVc;
  if (Array.isArray(r.tags)) out.tags = r.tags.filter((t): t is MoodTag => MOOD_TAGS.includes(t as MoodTag));
  if (typeof r.title === 'string') out.title = r.title.slice(0, LIMITS.title);
  return out;
}

function readJson(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても募集はできる
  }
}

export function CreateRecruitmentForm({
  auth,
  serverNow,
  src,
  ownerName,
}: {
  auth: 'guest' | 'no-profile' | 'ready';
  serverNow: string;
  src: string;
  /** プレビューの席に出す自分の名前 (未ログインなら「あなた」) */
  ownerName?: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createRecruitmentAction, null);
  const [now, setNow] = useState(() => new Date(serverNow));
  const [c, setC] = useState<Choices>(DEFAULTS);
  const [title, setTitle] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [resumed, setResumed] = useState(false);
  const ensureProfile = useEnsureProfile();
  const ensureRank = useEnsureRank();
  const rankOk = useRef(false);
  // v4: シートでプロフィールを作ったら、ページを移らずにそのまま送信する
  const profileOk = useRef(false);

  // 時計 (チップの表示・プレビュー用)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  // 前回の選択を初期値に。ログイン前に「募集する」を押していた場合は下書きを復元して自動送信
  useEffect(() => {
    const last = sanitize(readJson(LAST_KEY));
    // 開始時刻は前回の値を引き継がない (毎回「今すぐ」から)
    let next: Choices = { ...DEFAULTS, ...last, startKey: 'now', startDay: 'today', startTime: '' };
    if (auth === 'ready' && takeIntent((i) => i.kind === 'post')) {
      const draft = sanitize(readJson(DRAFT_KEY));
      next = { ...next, ...draft };
      setTitle(draft.title ?? '');
      setResumed(true);
      setAutoSubmit(true);
    }
    next.capacity = clampCapacity(next.purpose, next.capacity);
    setC(next);
  }, [auth]);

  const startKey: StartKey = c.startKey;
  const startAt = resolveStart(startKey, c.startDay, c.startTime, now);
  const capacity = clampCapacity(c.purpose, c.capacity);
  const placeholderTitle = autoTitle({ purpose: c.purpose, minRank: c.minRank || null, capacity });
  const titleError = containsUrl(title) ? 'URLは使えません' : null;
  const ready = Boolean(startAt) && !titleError;
  const [needStance, setNeedStance] = useState(false);

  useEffect(() => {
    if (autoSubmit && startAt) {
      setAutoSubmit(false);
      formRef.current?.requestSubmit();
    }
  }, [autoSubmit, startAt]);

  const set = <K extends keyof Choices>(k: K, v: Choices[K]) => setC((prev) => ({ ...prev, [k]: v }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const choices: Choices = { ...c, startKey, capacity };
    if (!ready) {
      e.preventDefault();
      return;
    }
    if (!c.stance) {
      e.preventDefault();
      setNeedStance(true);
      document.getElementById('stance')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if ((auth === 'guest' || auth === 'no-profile') && !profileOk.current) {
      e.preventDefault();
      writeJson(LAST_KEY, choices);
      void ensureProfile('募集').then((ok) => {
        if (!ok) return;
        profileOk.current = true;
        formRef.current?.requestSubmit();
      });
      return;
    }
    if (!rankOk.current) {
      e.preventDefault();
      writeJson(LAST_KEY, choices);
      void ensureRank().then((ok) => {
        if (!ok) return;
        rankOk.current = true;
        formRef.current?.requestSubmit();
      });
      return;
    }
    writeJson(LAST_KEY, choices);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  const summaryParts = [
    PURPOSE_LABELS[c.purpose],
    !startAt ? '時刻を選んでください' : startKey === 'now' ? '今すぐ' : `${startPreview(startAt, now).replace('今日 ', '')}〜`,
    ...(c.stance ? [STANCE_LABELS[c.stance]] : []),
    `あと${capacity - 1}人`,
  ];
  const previewSeats: Seat[] = [
    { kind: 'owner', name: ownerName ?? 'あなた', you: true },
    ...Array.from({ length: capacity - 1 }, () => ({ kind: 'empty' as const })),
  ];
  const legend = 'mb-3 flex w-full items-baseline justify-between gap-3 text-[15px] font-bold';

  const submitButton = (
    <button type="submit" className="btn-primary min-h-12 w-full flex-col gap-0 px-3 leading-tight lg:min-h-16 lg:gap-0.5" disabled={pending || !ready}>
      <span className="text-base font-bold">{pending ? '募集を出しています…' : '募集する'}</span>
      {!pending && (
        <span className="max-w-full truncate text-xs font-medium opacity-85">
          {summaryParts.join(' / ')}
          {!c.stance && <span className="ml-1 font-bold text-[#ffb39c]">/ 遊び方を選んでください</span>}
        </span>
      )}
    </button>
  );
  const submit = (
    <>
      {state && !state.ok && (
        <p className="alert-error" role="alert">
          {state.error}
        </p>
      )}
      {submitButton}
    </>
  );

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={`tone-${c.purpose} lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14`}>
      <input type="hidden" name="src" value={src} />
      <div className="space-y-8 pb-28 lg:pb-0">
        {resumed && <p className="alert-ok">先ほどの内容で募集を出しています…</p>}

        {/* 目的 */}
        <fieldset>
          <legend className={legend}>目的</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PURPOSES.map((p) => {
              const Icon = PURPOSE_ICON[p];
              return (
                <label
                  key={p}
                  className={`pick h-14 gap-2 px-2 text-[14px] sm:h-20 sm:flex-col sm:gap-1.5 sm:text-[13px]`}
                >
                  <input
                    type="radio"
                    name="purpose"
                    value={p}
                    checked={c.purpose === p}
                    onChange={() => setC((prev) => ({ ...prev, purpose: p, capacity: clampCapacity(p, prev.capacity) }))}
                    className="sr-only"
                  />
                  <Icon className="size-5" aria-hidden />
                  {PURPOSE_LABELS[p]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 遊び方 */}
        <fieldset id="stance" className={needStance && !c.stance ? 'outline-2 outline-offset-4 outline-signal-deep' : ''}>
          <legend className={legend}>
            <span>遊び方</span>
            {needStance && !c.stance && <span className="text-[13px] font-bold text-signal-deep">選んでください</span>}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {STANCES.map((st) => {
              const Icon = STANCE_ICON[st];
              return (
                <label key={st} className="pick gap-1.5">
                  <input type="radio" name="stance" value={st} checked={c.stance === st} onChange={() => set('stance', st)} className="sr-only" />
                  <Icon className="size-4" aria-hidden />
                  {STANCE_LABELS[st]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 開始 */}
        <fieldset>
          <legend className={legend}>
            <span>開始</span>
            {startAt && (
              <span className="text-[13px] font-medium text-slate tabular-nums">
                {startPreview(startAt, now)}〜{formatJstTime(autoEnd(startAt))}
              </span>
            )}
          </legend>
          <StartPicker
            now={now}
            startKey={startKey}
            day={c.startDay}
            hm={c.startTime}
            onChange={(k, d, hm) => setC((prev) => ({ ...prev, startKey: k, startDay: d, startTime: hm }))}
          />
        </fieldset>

        {/* 人数 */}
        <fieldset>
          <legend className={legend}>
            <span>人数</span>
            <span className="text-[13px] font-medium text-slate">あなたのほかに</span>
          </legend>
          <div className={`grid gap-2 ${c.purpose === 'custom' ? 'grid-cols-5' : 'grid-cols-2'}`}>
            {capacityOptions(c.purpose).map((n) => (
              <label key={n} className="pick px-1">
                <input type="radio" name="capacity" value={n} checked={capacity === n} onChange={() => set('capacity', n)} className="sr-only" />
                {c.purpose === 'custom' ? (
                  <span>
                    <span className="text-xs font-medium">あと</span>
                    {n - 1}人
                  </span>
                ) : (
                  `あと${n - 1}人`
                )}
              </label>
            ))}
          </div>
        </fieldset>

        {/* 参加方式 */}
        <fieldset>
          <legend className={legend}>参加方式</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['instant', Zap, '早い者勝ち', '押した人がそのまま参加'],
                ['approval', Hand, '承認制', 'あなたが申請を承認'],
              ] as const
            ).map(([mode, Icon, label, sub]) => (
              <label key={mode} className="pick group h-auto flex-col items-start gap-0.5 px-3 py-3 text-left">
                <input type="radio" name="joinMode" value={mode} checked={c.joinMode === mode} onChange={() => set('joinMode', mode)} className="sr-only" />
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="size-4" aria-hidden />
                  {label}
                </span>
                <span className="text-xs font-medium opacity-80">{sub}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* 条件・ひとこと */}
        <section className="border-t-2 border-ink pt-6">
          <h2 className="sr-only">条件</h2>
          <div className="space-y-8">
            <fieldset>
              <legend className={legend}>ランク条件</legend>
              <input type="hidden" name="minRank" value={c.minRank} />
              <RankPicker min value={c.minRank} onChange={(v) => set('minRank', v)} />
            </fieldset>
            <fieldset>
              <legend className={legend}>VC</legend>
              <div className="grid grid-cols-3 gap-2">
                {RECRUIT_VC.map((v) => (
                  <label key={v} className="pick px-1">
                    <input type="radio" name="vc" value={v} checked={c.vc === v} onChange={() => set('vc', v)} className="sr-only" />
                    {VC_SHORT[v]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={legend}>雰囲気</legend>
              <div className="flex flex-wrap gap-2">
                {PICK_TAGS.map((t) => (
                  <label key={t} className="pick">
                    <input
                      type="checkbox"
                      name="tags"
                      value={t}
                      checked={c.tags.includes(t)}
                      onChange={(e) => set('tags', e.target.checked ? [...c.tags, t] : c.tags.filter((x) => x !== t))}
                      className="sr-only"
                    />
                    #{MOOD_TAG_LABELS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="title">
                ひとこと <span className="text-xs font-medium text-slate">(任意)</span>
              </label>
              <input
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.title}
                className="input"
                placeholder={placeholderTitle}
                aria-describedby="title-hint"
              />
              <p id="title-hint" className={`hint flex justify-between ${titleError ? 'font-bold text-signal-deep' : ''}`}>
                <span>{titleError ?? 'URLは使えません'}</span>
                <span className="tabular-nums">{Array.from(title).length}/{LIMITS.title}</span>
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* PC: 右側にパーティのプレビューと募集ボタン */}
      <aside className="hidden lg:sticky lg:top-28 lg:block lg:space-y-6">
        <div className="sheet p-6">
          <div className="-mx-3 mt-4">
            <Lineup seats={previewSeats.slice(0, 3)} size="lg" label={`あなたと、あと${capacity - 1}人`} />
          </div>
          {capacity > 3 && <p className="mt-2 text-right text-xs font-bold text-slate">ほか{capacity - 3}席</p>}
          <p className="font-black mt-6 text-[22px] leading-snug">{title.trim() || placeholderTitle}</p>
        </div>
        <div className="space-y-2">{submit}</div>
      </aside>

      {/* スマホ: タブバーの上に固定 */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-ink bg-sheet lg:hidden">
        <div className="mx-auto max-w-xl space-y-2 px-4 py-2">
          {state && !state.ok && (
            <p className="alert-error" role="alert">
              {state.error}
            </p>
          )}
          {submitButton}
        </div>
      </div>
    </form>
  );
}

/**
 * 開始時刻: 「今すぐ / 今日 / 明日」を選び、今日か明日なら「時」と「分 (15分刻み)」を選ぶ。
 * 時は横に流れる1行にして、縦に長くならないようにする。
 */
function StartPicker({
  now,
  startKey,
  day,
  hm,
  onChange,
}: {
  now: Date;
  startKey: StartKey;
  day: StartDay;
  hm: string;
  onChange: (k: StartKey, d: StartDay, hm: string) => void;
}) {
  const hourRef = useRef<HTMLDivElement>(null);
  const hours = selectableHours(day, now);
  const [h, m] = hm ? hm.split(':').map(Number) : [NaN, NaN];
  const pad = (n: number) => String(n).padStart(2, '0');

  // 選んだ時がスクロールの中で見えるように
  useEffect(() => {
    const el = hourRef.current?.querySelector<HTMLElement>('[data-on="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day, h]);

  function pickDay(d: StartDay) {
    if (d === 'today') {
      const n = nextSlot(now);
      onChange('slot', n.day, n.hm);
    } else {
      onChange('slot', 'tomorrow', hm && day === 'tomorrow' ? hm : '21:00');
    }
  }
  function pickHour(hour: number) {
    const mins = SLOT_MINUTES.filter((mi) => slotAt(day, `${pad(hour)}:${pad(mi)}`, now));
    const keep = mins.includes(m as (typeof SLOT_MINUTES)[number]) ? m : mins[0];
    onChange('slot', day, `${pad(hour)}:${pad(keep ?? 0)}`);
  }
  const seg = (on: boolean) =>
    `inline-flex min-h-12 items-center justify-center border-2 text-sm font-bold transition-colors ${
      on ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-sheet text-ink-2 hover:border-ink'
    }`;

  return (
    <div className="space-y-2">
      <input type="hidden" name="startKey" value={startKey} />
      <input type="hidden" name="startDay" value={day} />
      <input type="hidden" name="startTime" value={startKey === 'slot' ? hm : ''} />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="開始">
        <button type="button" role="radio" aria-checked={startKey === 'now'} className={seg(startKey === 'now')} onClick={() => onChange('now', day, hm)}>
          今すぐ
        </button>
        <button type="button" role="radio" aria-checked={startKey === 'slot' && day === 'today'} className={seg(startKey === 'slot' && day === 'today')} onClick={() => pickDay('today')} disabled={selectableHours('today', now).every((hh) => SLOT_MINUTES.every((mi) => !slotAt('today', `${pad(hh)}:${pad(mi)}`, now)))}>
          今日
        </button>
        <button type="button" role="radio" aria-checked={startKey === 'slot' && day === 'tomorrow'} className={seg(startKey === 'slot' && day === 'tomorrow')} onClick={() => pickDay('tomorrow')}>
          明日
        </button>
      </div>
      {startKey === 'slot' && (
        <div className="space-y-2 border-2 border-ink/15 p-2">
          <div
            ref={hourRef}
            className="no-scrollbar -mx-2 flex snap-x gap-1 overflow-x-auto px-2 [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]"
            role="radiogroup"
            aria-label="時"
          >
            {hours.map((hour) => {
              const on = hour === h;
              return (
                <button
                  key={hour}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-on={on}
                  onClick={() => pickHour(hour)}
                  className={`type-time min-h-11 min-w-12 shrink-0 snap-center px-1 text-[22px] ${on ? 'bg-ink text-white' : 'text-ink hover:bg-tint'}`}
                >
                  {pad(hour)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="分">
            {SLOT_MINUTES.map((mi) => {
              const ok = Number.isFinite(h) && Boolean(slotAt(day, `${pad(h)}:${pad(mi)}`, now));
              const on = ok && mi === m;
              return (
                <button
                  key={mi}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!ok}
                  onClick={() => onChange('slot', day, `${pad(h)}:${pad(mi)}`)}
                  className={`type-time min-h-11 text-[20px] disabled:opacity-25 ${on ? 'bg-ink text-white' : 'border border-ink/20 text-ink hover:border-ink'}`}
                >
                  :{pad(mi)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
