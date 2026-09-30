'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { saveProfileAction } from '@/app/actions';
import { FormMessage } from '@/components/FormMessage';
import {
  LIMITS,
  MOOD_TAGS,
  MOOD_TAG_LABELS,
  PLAY_ROLES,
  PLAY_ROLE_LABELS,
  PROFILE_VC,
  PROFILE_VC_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  RANK_BANDS,
  RANK_LABELS,
} from '@/lib/constants';
import type { Profile } from '@/lib/types';

interface Contacts {
  contact_discord: string | null;
  contact_x: string | null;
  contact_ingame: string | null;
}

export function ProfileForm({
  isNew,
  next,
  profile,
  contacts,
}: {
  isNew: boolean;
  next: string;
  profile: Profile | null;
  contacts: Contacts | null;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, null);
  const chars = [...(profile?.characters ?? []), '', '', ''].slice(0, LIMITS.maxCharacters);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="isNew" value={isNew ? '1' : '0'} />
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="displayName">表示名</label>
        <input id="displayName" name="displayName" required maxLength={LIMITS.displayName} defaultValue={profile?.display_name ?? ''} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="rankBand">ランク帯</label>
        <select id="rankBand" name="rankBand" required defaultValue={profile?.rank_band ?? ''} className="input">
          <option value="" disabled>選択してください</option>
          {RANK_BANDS.map((r) => (
            <option key={r} value={r}>{RANK_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="label">得意ロール (複数可)</legend>
        <div className="flex flex-wrap gap-2">
          {PLAY_ROLES.map((r) => (
            <label key={r} className="check-pill">
              <input type="checkbox" name="playRoles" value={r} defaultChecked={profile?.play_roles.includes(r)} className="sr-only" />
              {PLAY_ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">よく使うキャラ (最大3人・自由入力)</legend>
        <div className="grid grid-cols-3 gap-2">
          {chars.map((c, i) => (
            <input key={i} name="characters" defaultValue={c} maxLength={LIMITS.characterName} className="input" aria-label={`キャラ${i + 1}`} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">目的 (複数可)</legend>
        <div className="flex flex-wrap gap-2">
          {PURPOSES.map((p) => (
            <label key={p} className="check-pill">
              <input type="checkbox" name="purposes" value={p} defaultChecked={profile?.purposes.includes(p)} className="sr-only" />
              {PURPOSE_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">VC</legend>
        <div className="flex flex-wrap gap-2">
          {PROFILE_VC.map((v) => (
            <label key={v} className="check-pill">
              <input type="radio" name="vc" value={v} defaultChecked={(profile?.vc ?? 'listen') === v} className="sr-only" />
              {PROFILE_VC_LABELS[v]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">雰囲気タグ (複数可)</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map((t) => (
            <label key={t} className="check-pill">
              <input type="checkbox" name="tags" value={t} defaultChecked={profile?.tags.includes(t)} className="sr-only" />#{MOOD_TAG_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="bio">自己紹介 (200字まで・URL不可)</label>
        <textarea id="bio" name="bio" maxLength={LIMITS.bio} rows={4} defaultValue={profile?.bio ?? ''} className="input" />
      </div>

      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-bold">連絡先 (任意)</legend>
        <p className="text-xs text-muted">
          入力したものだけが、<strong>あなたの募集で承認した相手</strong>と<strong>あなたの参加が承認された募集のメンバー</strong>にだけ表示されます。一覧や他のページには表示されません。
        </p>
        <div>
          <label className="label" htmlFor="contactDiscord">DiscordのユーザーID</label>
          <input id="contactDiscord" name="contactDiscord" maxLength={32} defaultValue={contacts?.contact_discord ?? ''} className="input" autoCapitalize="off" />
        </div>
        <div>
          <label className="label" htmlFor="contactX">XのID</label>
          <input id="contactX" name="contactX" maxLength={16} defaultValue={contacts?.contact_x ?? ''} className="input" placeholder="@なしでも可" autoCapitalize="off" />
        </div>
        <div>
          <label className="label" htmlFor="contactIngame">ゲーム内ID / プレイヤー名</label>
          <input id="contactIngame" name="contactIngame" maxLength={20} defaultValue={contacts?.contact_ingame ?? ''} className="input" />
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agreeTerms" required={isNew} className="mt-1 size-4" />
        <span>
          <Link href="/terms" className="link" target="_blank">利用規約</Link>と
          <Link href="/privacy" className="link" target="_blank">プライバシーポリシー</Link>に同意します。
          (13歳未満の方は利用できません。18歳未満の方は保護者の同意を得てください){!isNew && ' ※更新時は任意'}
        </span>
      </label>

      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? '保存中…' : isNew ? 'はじめる' : '保存する'}</button>
    </form>
  );
}
