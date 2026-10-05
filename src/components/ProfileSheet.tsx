'use client';
import { RankPicker } from '@/components/RankPicker';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { createProfileAction } from '@/app/actions';
import { getBrowserClient } from '@/lib/supabase/client';
import { LIMITS, PLAY_ROLES, PLAY_ROLE_LABELS, RANK_BANDS, RANK_BANDS_DESC, RANK_LABELS, type PlayRole, type RankBand } from '@/lib/constants';
import { containsUrl } from '@/lib/validation/url';
import { Lineup } from './Lineup';
import { RoleIcon } from './RoleIcon';

/**
 * v4: 登録なしで始めるためのシート。
 * 「参加する」「空き席」「募集する」を初めて押したときに下から出し、表示名・ランク帯 (必須はこの2つ)・
 * ロール (任意)・同意 →「はじめる」で、匿名サインイン → プロフィール作成 → 元の操作の続き、を
 * ページを読み込み直さずに行う。2回目からは cookie のセッションで続きから使える。
 */
type Ensure = (verb: string) => Promise<boolean>;

const Ctx = createContext<Ensure | null>(null);

/** プロフィールがなければシートを開き、作れたら true */
export function useEnsureProfile(): Ensure {
  const ensure = useContext(Ctx);
  return ensure ?? (async () => false);
}

export function OnboardingProvider({ children, initialOpen = false }: { children: React.ReactNode; initialOpen?: boolean }) {
  const [verb, setVerb] = useState<string | null>(initialOpen ? '参加' : null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ensure = useCallback<Ensure>((v) => {
    resolver.current?.(false);
    setVerb(v);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setVerb(null);
  };

  return (
    <Ctx.Provider value={ensure}>
      {children}
      {verb && <ProfileSheet verb={verb} onDone={() => close(true)} onCancel={() => close(false)} />}
    </Ctx.Provider>
  );
}

/**
 * プロフィールを作るフォーム (シートとマイページで共通)。
 * 表示名・ランク帯が必須、ロールは任意。匿名サインイン → プロフィール作成まで行う。
 */
export function ProfileStartForm({
  onDone,
  autoFocus = true,
  page = false,
}: {
  onDone: () => void;
  autoFocus?: boolean;
  /** マイページに置くとき: 「はじめる」を下のタブバーの上に固定する */
  page?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [rank, setRank] = useState<RankBand | ''>('');
  const [roles, setRoles] = useState<PlayRole[]>([]);
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);


  const nameError = containsUrl(name) ? 'URLは使えません' : null;
  const missing = [name.trim().length > 0 && !nameError, rank !== '', agree].filter((ok) => !ok).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // 接続元ごとの回数制限が利用者ごとに効くよう、ブラウザから直接作る
        const { error: err } = await supabase.auth.signInAnonymously();
        if (err) {
          setError(
            err.status === 429
              ? '混んでます。1分くらい待ってもう一度'
              : err.code === 'anonymous_provider_disabled'
                ? '今は始められません (設定待ち)'
                : '始められませんでした。もう一度押してください',
          );
          setPending(false);
          return;
        }
      }
      const r = await createProfileAction({ displayName: name, rankBand: rank, playRoles: roles, agreeTerms: agree });
      if (!r.ok) {
        setError(r.error);
        setPending(false);
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setError('始められませんでした。もう一度押してください');
      setPending(false);
    }
  }

  const seat = { kind: 'member' as const, id: name.trim() || undefined, name: name.trim() || 'あなた', rank: rank || null, roles, you: true };

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
        <form onSubmit={submit} className={page ? 'space-y-6' : 'space-y-6 px-4 pt-4'}>
          <div className="w-28" aria-hidden>
            <Lineup seats={[seat, { kind: 'empty' }, { kind: 'empty' }]} label="" />
          </div>

          <div>
            <label className="label" htmlFor="sheet-name">表示名</label>
            <input
              ref={nameRef}
              id="sheet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.displayName}
              autoComplete="nickname"
              enterKeyHint="next"
              className="input text-lg font-bold"
              aria-describedby={nameError ? 'sheet-name-error' : undefined}
            />
            {nameError && <p id="sheet-name-error" className="hint font-bold text-signal-deep">{nameError}</p>}
          </div>

          <fieldset>
            <legend className="label">ランク</legend>
            <RankPicker value={rank} onChange={setRank} />
          </fieldset>

          <fieldset>
            <legend className="label">
              得意なロール <span className="text-xs font-medium text-slate">(任意)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLAY_ROLES.map((r) => (
                <label key={r} className="pick justify-start px-3 text-[13px] sm:justify-center sm:px-1">
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))}
                    className="sr-only"
                  />
                  <RoleIcon role={r} className="size-4" />
                  {PLAY_ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-3 border-2 border-line bg-sheet p-3 text-sm has-[:checked]:border-ink">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)]" />
            <span>
              <Link href="/terms" className="link" target="_blank">利用規約</Link>と
              <Link href="/privacy" className="link" target="_blank">プライバシーポリシー</Link>
              に同意します

            </span>
          </label>

          {/* 「はじめる」は長いシートでも常に見えるよう、下に固定する */}
          <div className={page ? 'space-y-2' : 'sticky bottom-0 -mx-4 space-y-2 border-t-2 border-ink bg-floor px-4 pt-3 pb-3'}>
            {error && <p className="alert-error" role="alert">{error}</p>}
            <button className="btn-primary btn-lg w-full text-base" disabled={pending || missing > 0}>
              {pending ? '準備中…' : missing > 0 ? `はじめる (あと${missing}項目)` : 'はじめる'}
              {!pending && missing === 0 && <ArrowRight className="size-5" aria-hidden />}
            </button>
          </div>
          {!page && (
          <p className="flex flex-wrap justify-between gap-x-4 text-[13px]">
              <Link href="/transfer" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                引き継ぐ
              </Link>
              <Link href="/login" className="inline-flex min-h-11 items-center text-slate underline underline-offset-4">
                以前の方法でログイン
              </Link>
            </p>
          )}
        </form>
  );
}

function ProfileSheet({ verb, onDone, onCancel }: { verb: string; onDone: () => void; onCancel: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pending = false;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
      // シートの中でフォーカスを回す
      if (e.key === 'Tab' && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>('input, button, a[href]');
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="閉じる" tabIndex={-1} className="sheet-backdrop absolute inset-0 bg-ink/60" onClick={() => !pending && onCancel()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="sheet-panel relative max-h-[92dvh] w-full max-w-lg overflow-y-auto bg-floor pb-[env(safe-area-inset-bottom)] lg:max-h-[88dvh]"
      >
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
          <h2 id="sheet-title" className="type-heavy text-[17px]">
            あなたの席をつくる
          </h2>
          <button type="button" onClick={onCancel} disabled={pending} className="-mr-2 flex size-11 items-center justify-center" aria-label="閉じる">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ProfileStartForm onDone={onDone} />
      </div>
    </div>
  );
}
