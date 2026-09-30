'use client';
import { useActionState } from 'react';
import { createRecruitmentAction } from '@/app/actions';
import { FormMessage } from '@/components/FormMessage';
import {
  DURATION_OPTIONS_MIN,
  LIMITS,
  MOOD_TAGS,
  MOOD_TAG_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  RANK_BANDS,
  RANK_LABELS,
  RECRUIT_VC,
  RECRUIT_VC_LABELS,
} from '@/lib/constants';

function durationLabel(min: number) {
  if (min < 60) return `${min}分`;
  return min % 60 === 0 ? `${min / 60}時間` : `${Math.floor(min / 60)}時間${min % 60}分`;
}

export function RecruitmentForm({ defaultStart, src }: { defaultStart: string; src: string }) {
  const [state, formAction, pending] = useActionState(createRecruitmentAction, null);
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="src" value={src} />
      <div>
        <label className="label" htmlFor="title">タイトル</label>
        <input id="title" name="title" required maxLength={LIMITS.title} className="input" placeholder="例: 21時からまったりバトアリ" />
      </div>
      <fieldset>
        <legend className="label">目的</legend>
        <div className="flex flex-wrap gap-2">
          {PURPOSES.map((p, i) => (
            <label key={p} className="check-pill">
              <input type="radio" name="purpose" value={p} defaultChecked={i === 2} className="sr-only" />
              {PURPOSE_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="startsAtLocal">開始日時 (日本時間)</label>
          <input id="startsAtLocal" name="startsAtLocal" type="datetime-local" required defaultValue={defaultStart} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="durationMin">終了予定</label>
          <select id="durationMin" name="durationMin" defaultValue="60" className="input">
            {DURATION_OPTIONS_MIN.map((m) => (
              <option key={m} value={m}>{durationLabel(m)}後</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="capacity">募集人数 (自分を含む)</label>
          <select id="capacity" name="capacity" defaultValue="3" className="input">
            {Array.from({ length: LIMITS.maxCapacity - LIMITS.minCapacity + 1 }, (_, i) => i + LIMITS.minCapacity).map((n) => (
              <option key={n} value={n}>{n}人 (あと{n - 1}人)</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="minRank">必要ランク帯 (任意)</label>
          <select id="minRank" name="minRank" defaultValue="" className="input">
            <option value="">指定なし</option>
            {RANK_BANDS.map((r) => (
              <option key={r} value={r}>{RANK_LABELS[r]}以上</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vc">VC</label>
          <select id="vc" name="vc" defaultValue="any" className="input">
            {RECRUIT_VC.map((v) => (
              <option key={v} value={v}>{RECRUIT_VC_LABELS[v]}</option>
            ))}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">雰囲気タグ (複数可)</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map((t) => (
            <label key={t} className="check-pill">
              <input type="checkbox" name="tags" value={t} className="sr-only" />#{MOOD_TAG_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="note">メモ (任意)</label>
        <textarea id="note" name="note" maxLength={LIMITS.note} rows={3} className="input" placeholder="例: 1〜2戦だけ / 初心者さん歓迎" />
        <p className="hint">URLは書けません。連絡先はここに書かず、プロフィールの「連絡先」に設定してください。</p>
      </div>
      <div>
        <label className="label" htmlFor="roomCode">部屋番号 (任意・あとから設定可)</label>
        <input id="roomCode" name="roomCode" maxLength={LIMITS.roomCode} inputMode="numeric" className="input" placeholder="例: 12345" />
        <p className="hint">承認した参加者にだけ表示されます。</p>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? '作成中…' : '募集を出す'}</button>
    </form>
  );
}
