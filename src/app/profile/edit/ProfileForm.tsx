'use client';
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

/** マイページのプロフィール編集 (全項目。初回登録で聞かなかった項目もここで追加する) */
export function ProfileForm({ profile, contacts }: { profile: Profile; contacts: Contacts | null }) {
  const [state, formAction, pending] = useActionState(saveProfileAction, null);
  const chars = [...profile.characters, '', '', ''].slice(0, LIMITS.maxCharacters);

  return (
    <form action={formAction} className="space-y-7">
      <div>
        <label className="label" htmlFor="displayName">表示名</label>
        <input id="displayName" name="displayName" required maxLength={LIMITS.displayName} defaultValue={profile.display_name} className="input" />
      </div>
      <fieldset>
        <legend className="label">ランク帯</legend>
        <div className="grid grid-cols-3 gap-2">
          {RANK_BANDS.map((r) => (
            <label key={r} className="pick">
              <input type="radio" name="rankBand" value={r} defaultChecked={profile.rank_band === r} required className="sr-only" />
              {RANK_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">得意ロール <span className="text-xs font-normal text-muted">(複数可)</span></legend>
        <div className="grid grid-cols-2 gap-2">
          {PLAY_ROLES.map((r) => (
            <label key={r} className="pick">
              <input type="checkbox" name="playRoles" value={r} defaultChecked={profile.play_roles.includes(r)} className="sr-only" />
              {PLAY_ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">よく使うキャラ <span className="text-xs font-normal text-muted">(3人まで・自由入力)</span></legend>
        <div className="grid grid-cols-3 gap-2">
          {chars.map((c, i) => (
            <input key={i} name="characters" defaultValue={c} maxLength={LIMITS.characterName} className="input" aria-label={`キャラ${i + 1}`} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">よく遊ぶ目的 <span className="text-xs font-normal text-muted">(複数可)</span></legend>
        <div className="grid grid-cols-2 gap-2">
          {PURPOSES.map((p) => (
            <label key={p} className={`tone-${p} pick`}>
              <input type="checkbox" name="purposes" value={p} defaultChecked={profile.purposes.includes(p)} className="sr-only" />
              {PURPOSE_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">VC</legend>
        <div className="grid grid-cols-3 gap-2">
          {PROFILE_VC.map((v) => (
            <label key={v} className="pick px-1 text-xs">
              <input type="radio" name="vc" value={v} defaultChecked={profile.vc === v} className="sr-only" />
              {PROFILE_VC_LABELS[v]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">雰囲気タグ <span className="text-xs font-normal text-muted">(複数可)</span></legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map((t) => (
            <label key={t} className="pick">
              <input type="checkbox" name="tags" value={t} defaultChecked={profile.tags.includes(t)} className="sr-only" />#{MOOD_TAG_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="bio">自己紹介 <span className="text-xs font-normal text-muted">(200字まで・URL不可)</span></label>
        <textarea id="bio" name="bio" maxLength={LIMITS.bio} rows={4} defaultValue={profile.bio} className="input" />
      </div>

      <fieldset id="contacts" className="card scroll-mt-16 space-y-4">
        <legend className="px-1 text-sm font-extrabold">連絡先 (任意)</legend>
        <p className="text-xs text-muted">
          入力したものだけが、<strong className="text-fg">あなたの募集に参加が確定した人</strong>と、
          <strong className="text-fg">あなたが参加した募集の募集者</strong>にだけ表示されます。一覧や他のページには出ません。
        </p>
        <div>
          <label className="label" htmlFor="contactDiscord">DiscordのユーザーID</label>
          <input id="contactDiscord" name="contactDiscord" maxLength={32} defaultValue={contacts?.contact_discord ?? ''} className="input" autoCapitalize="off" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="contactX">XのID</label>
          <input id="contactX" name="contactX" maxLength={16} defaultValue={contacts?.contact_x ?? ''} className="input" placeholder="@なしでも可" autoCapitalize="off" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="contactIngame">ゲーム内ID / プレイヤー名</label>
          <input id="contactIngame" name="contactIngame" maxLength={20} defaultValue={contacts?.contact_ingame ?? ''} className="input" autoComplete="off" />
        </div>
      </fieldset>

      <FormMessage state={state} />
      <button className="btn-primary btn-lg w-full" disabled={pending}>{pending ? '保存中…' : '保存する'}</button>
    </form>
  );
}
