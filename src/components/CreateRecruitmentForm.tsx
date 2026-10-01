'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Gamepad2, Hand, Sparkles, Swords, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { createRecruitmentAction } from '@/app/actions';
import {
  JOIN_MODES,
  LIMITS,
  MOOD_TAGS,
  MOOD_TAG_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  RANK_BANDS,
  RANK_MIN_LABELS,
  RECRUIT_VC,
  type JoinMode,
  type MoodTag,
  type Purpose,
  type RankBand,
  type RecruitVc,
} from '@/lib/constants';
import { capacityOptions, clampCapacity } from '@/lib/capacity';
import { autoEnd, autoTitle, resolveStart, startChips, startPreview, START_KEYS, type StartKey } from '@/lib/recruit';
import { formatJstTime } from '@/lib/time';
import { containsUrl } from '@/lib/validation/url';
import { authGateHref, saveIntent, takeIntent } from '@/lib/intent';
import { Lineup, type Seat } from '@/components/Lineup';
import { RankPrompt } from '@/components/RankPrompt';

const PURPOSE_ICON: Record<Purpose, LucideIcon> = { rank: Trophy, enjoy: Sparkles, tournament: Swords, custom: Gamepad2 };
const VC_SHORT: Record<RecruitVc, string> = { on: 'あり', any: 'どちらでも', off: 'なし' };

const LAST_KEY = 'cm_last_recruit';
const DRAFT_KEY = 'cm_recruit_draft';

interface Choices {
  purpose: Purpose;
  startKey: StartKey;
  startTime: string;
  capacity: number;
  joinMode: JoinMode;
  minRank: RankBand | '';
  vc: RecruitVc;
  tags: MoodTag[];
}
interface Draft extends Choices {
  title: string;
  roomCode: string;
}

const DEFAULTS: Choices = {
  purpose: 'enjoy',
  startKey: 'now',
  startTime: '',
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
  if (typeof r.startTime === 'string' && /^\d{2}:\d{2}$/.test(r.startTime)) out.startTime = r.startTime;
  if (typeof r.capacity === 'number') out.capacity = r.capacity;
  if (JOIN_MODES.includes(r.joinMode as JoinMode)) out.joinMode = r.joinMode as JoinMode;
  if (r.minRank === '' || RANK_BANDS.includes(r.minRank as RankBand)) out.minRank = r.minRank as RankBand | '';
  if (RECRUIT_VC.includes(r.vc as RecruitVc)) out.vc = r.vc as RecruitVc;
  if (Array.isArray(r.tags)) out.tags = r.tags.filter((t): t is MoodTag => MOOD_TAGS.includes(t as MoodTag));
  if (typeof r.title === 'string') out.title = r.title.slice(0, LIMITS.title);
  if (typeof r.roomCode === 'string') out.roomCode = r.roomCode.slice(0, LIMITS.roomCode);
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
  auth: 'guest' | 'no-profile' | 'ready' | 'needs-rank';
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
  const [roomCode, setRoomCode] = useState('');
  const [open, setOpen] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [askRank, setAskRank] = useState(false);
  const [rankOk, setRankOk] = useState(false);
  const rankPrompt = askRank && (
    <RankPrompt
      verb="募集"
      onConfirmed={() => {
        setRankOk(true);
        setAskRank(false);
        // 状態の反映を待ってから送信する
        setTimeout(() => formRef.current?.requestSubmit(), 0);
      }}
    />
  );

  // 時計 (チップの表示・プレビュー用)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  // 前回の選択を初期値に。ログイン前に「募集する」を押していた場合は下書きを復元して自動送信
  useEffect(() => {
    const last = sanitize(readJson(LAST_KEY));
    let next: Choices = { ...DEFAULTS, ...last, startTime: last.startTime ?? '' };
    if ((auth === 'ready' || auth === 'needs-rank') && takeIntent((i) => i.kind === 'post')) {
      const draft = sanitize(readJson(DRAFT_KEY));
      next = { ...next, ...draft };
      setTitle(draft.title ?? '');
      setRoomCode(draft.roomCode ?? '');
      if (draft.minRank || draft.tags?.length || draft.title || draft.roomCode) setOpen(true);
      setResumed(true);
      setAutoSubmit(true);
    }
    next.capacity = clampCapacity(next.purpose, next.capacity);
    setC(next);
  }, [auth]);

  const chips = useMemo(() => startChips(now), [now]);
  const chipKeys = chips.map((x) => x.key);
  // 前回のチップがもう過ぎていたら「今すぐ」に戻す
  const startKey: StartKey = c.startKey === 'custom' || chipKeys.includes(c.startKey) ? c.startKey : 'now';
  const startAt = resolveStart(startKey, c.startTime, now);
  const capacity = clampCapacity(c.purpose, c.capacity);
  const placeholderTitle = autoTitle({ purpose: c.purpose, minRank: c.minRank || null, capacity });
  const titleError = containsUrl(title) ? 'URLは入力できません' : null;
  const roomError = roomCode && !/^[0-9A-Za-z-]{1,16}$/.test(roomCode) ? '半角英数字16文字以内' : null;
  const ready = Boolean(startAt) && !titleError && !roomError;

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
    // 初めての募集: ランク帯を1タップで選んでから送信する
    if (auth === 'needs-rank' && !rankOk) {
      e.preventDefault();
      setAskRank(true);
      return;
    }
    if (auth === 'guest' || auth === 'no-profile') {
      e.preventDefault();
      writeJson(DRAFT_KEY, { ...choices, title, roomCode } satisfies Draft);
      writeJson(LAST_KEY, choices);
      saveIntent({ kind: 'post' });
      router.push(authGateHref(auth, '/recruitments/new'));
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
    `あと${capacity - 1}人`,
  ];
  const previewSeats: Seat[] = [
    { kind: 'owner', name: ownerName ?? 'あなた', you: true },
    ...Array.from({ length: capacity - 1 }, () => ({ kind: 'empty' as const })),
  ];
  const legend = 'mb-3 flex w-full items-baseline justify-between gap-3 text-[15px] font-bold';

  const submitButton = (
    <button type="submit" className="btn-primary min-h-12 w-full flex-col gap-0 px-3 leading-tight lg:min-h-16 lg:gap-0.5" disabled={pending || !ready || askRank}>
      <span className="text-base font-bold">{pending ? '募集を出しています…' : '募集する'}</span>
      {!pending && <span className="max-w-full truncate text-xs font-medium opacity-85">{summaryParts.join(' / ')}</span>}
    </button>
  );
  const submit = (
    <>
      {state && !state.ok && (
        <p className="alert-error" role="alert">
          {state.error}
        </p>
      )}
      {rankPrompt}
      {submitButton}
    </>
  );

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={`tone-${c.purpose} lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14`}>
      <input type="hidden" name="src" value={src} />
      <div className="space-y-8 pb-24 lg:pb-0">
        {resumed && <p className="alert-ok">さっきの内容で募集を出しています…</p>}

        {/* 目的 */}
        <fieldset>
          <legend className={legend}>目的</legend>
          <div className="grid grid-cols-4 gap-2">
            {PURPOSES.map((p) => {
              const Icon = PURPOSE_ICON[p];
              return (
                <label
                  key={p}
                  className={`tone-${p} pick h-20 flex-col gap-1.5 px-1 text-[13px] has-[:checked]:border-[var(--tone)] has-[:checked]:bg-[var(--tone)]`}
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

        {/* 開始 */}
        <fieldset>
          <legend className={legend}>
            <span>開始</span>
            {startAt && (
              <span className="text-[13px] font-medium text-slate tabular-nums">
                {startPreview(startAt, now)}〜{formatJstTime(autoEnd(startAt))} (1時間)
              </span>
            )}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {chips.map((chip) => (
              <label key={chip.key} className="pick">
                <input
                  type="radio"
                  name="startKey"
                  value={chip.key}
                  checked={startKey === chip.key}
                  onChange={() => set('startKey', chip.key)}
                  className="sr-only"
                />
                {chip.label}
              </label>
            ))}
            <label className="pick">
              <input
                type="radio"
                name="startKey"
                value="custom"
                checked={startKey === 'custom'}
                onChange={() => set('startKey', 'custom')}
                className="sr-only"
              />
              その他
            </label>
          </div>
          {startKey === 'custom' && (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="time"
                name="startTime"
                value={c.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                step={300}
                required
                aria-label="開始時刻"
                className="input w-36 text-center text-lg font-bold tabular-nums"
              />
              <span className="text-xs text-slate">過ぎた時刻は翌日になります</span>
            </div>
          )}
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
                ['instant', Zap, '早い者勝ち', '押した人がすぐ参加'],
                ['approval', Hand, '承認制', 'あなたが選んで承認'],
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

        {/* 詳細 (任意) */}
        <section className="border-y-2 border-ink">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="details"
            className="flex min-h-14 w-full items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">くわしく決める (任意)</span>
              <span className="block truncate text-xs text-slate">ランク条件・VC・雰囲気・ひとこと・部屋番号</span>
            </span>
            <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <div id="details" hidden={!open} className="space-y-8 pt-2 pb-6">
            <fieldset>
              <legend className={legend}>ランク条件</legend>
              <div className="grid grid-cols-4 gap-2">
                <label className="pick px-1 text-[13px]">
                  <input type="radio" name="minRank" value="" checked={c.minRank === ''} onChange={() => set('minRank', '')} className="sr-only" />
                  指定なし
                </label>
                {RANK_BANDS.map((r) => (
                  <label key={r} className="pick px-1">
                    <input type="radio" name="minRank" value={r} checked={c.minRank === r} onChange={() => set('minRank', r)} className="sr-only" />
                    {RANK_MIN_LABELS[r]}
                  </label>
                ))}
              </div>
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
              <legend className={legend}>
                <span>雰囲気</span>
                <span className="text-[13px] font-medium text-slate">いくつでも</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {MOOD_TAGS.map((t) => (
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
                ひとこと <span className="text-xs font-medium text-slate">(なくてもOK)</span>
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
                <span>{titleError ?? 'URLは書けません。連絡先はプロフィールに'}</span>
                <span className="tabular-nums">{Array.from(title).length}/{LIMITS.title}</span>
              </p>
            </div>
            <div>
              <label className="label" htmlFor="roomCode">
                部屋番号 <span className="text-xs font-medium text-slate">(あとからでも入れられます)</span>
              </label>
              <input
                id="roomCode"
                name="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.trim())}
                maxLength={LIMITS.roomCode}
                inputMode="numeric"
                autoComplete="off"
                className="input tracking-widest"
                placeholder="例: 12345"
                aria-describedby="room-hint"
              />
              <p id="room-hint" className={`hint ${roomError ? 'font-bold text-signal-deep' : ''}`}>{roomError ?? 'パーティのメンバーにだけ見えます'}</p>
            </div>
          </div>
        </section>
      </div>

      {/* PC: 右側にパーティのプレビューと募集ボタン */}
      <aside className="hidden lg:sticky lg:top-28 lg:block lg:space-y-6">
        <div className="sheet p-6">
          <p className="text-sm font-bold">この内容で出します</p>
          <div className="-mx-3 mt-4">
            <Lineup seats={previewSeats.slice(0, 3)} size="lg" label={`あなたと、あと${capacity - 1}人`} />
          </div>
          {capacity > 3 && <p className="mt-2 text-right text-xs font-bold text-slate">ほか{capacity - 3}席</p>}
          <p className="font-display mt-6 text-[22px] leading-snug">{title.trim() || placeholderTitle}</p>
        </div>
        <div className="space-y-2">{submit}</div>
      </aside>

      {/* スマホ: タブバーの上に固定 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto max-w-xl space-y-2 px-4 py-2">
          {state && !state.ok && (
            <p className="alert-error" role="alert">
              {state.error}
            </p>
          )}
          {rankPrompt}
          <div className="flex items-center gap-3">
            <div className="w-[5.5rem] shrink-0">
              <Lineup seats={previewSeats} label={`あなたと、あと${capacity - 1}人`} />
            </div>
            <div className="min-w-0 flex-1">{submitButton}</div>
          </div>
        </div>
      </div>
    </form>
  );
}
