import { MiniSeat, ProfileSeat } from '@/components/Lineup';
import { FollowButton } from '@/components/FollowButton';
import { PushToggle } from '@/components/PushToggle';
import Link from 'next/link';
import { ChevronRight, Pencil, Shield, ShieldBan, UserRound } from 'lucide-react';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { RoleIcon } from '@/components/RoleIcon';
import { SignOutButton } from '@/components/SignOutButton';
import { TransferIssue } from '@/components/TransferForms';
import type { AccountKind } from '@/lib/transfer';
import { PLAY_ROLE_LABELS, rankLabel } from '@/lib/constants';
import type { Profile, Recruitment } from '@/lib/types';
import type { PlayRole, RankBand } from '@/lib/constants';

export interface Mate {
  id: string;
  display_name: string;
  rank_band: RankBand | null;
  play_roles: PlayRole[];
  avatar?: import("@/lib/constants").Avatar | null;
  times: number;
  following: boolean;
}
import type { JoinState } from '@/lib/capacity';

export interface MeViewProps {
  userId: string;
  profile: Profile;
  loginId: string | null;
  /** v4: どうやってログインしているか (匿名 / 引き継ぎコード付き / v3 のユーザーID / Discord) */
  accountKind: AccountKind;
  /** 引き継ぎコード用のアドレス (付けていれば) */
  transferEmail: string | null;
  /** 開発用プレビュー: 作った直後のコードを表示した状態 */
  previewTransferCode?: string;
  isAdmin: boolean;
  hasContacts: boolean;
  mine: Recruitment[];
  joined: { status: JoinState; recruitment: Recruitment }[];
  mates: Mate[];
  now: Date;
}

export function MeView({ userId, profile, loginId, accountKind, transferEmail, previewTransferCode, isAdmin, hasContacts, mine, joined, mates, now }: MeViewProps) {
  const warnNoWayBack = accountKind === 'anonymous';
  const menu = 'flex min-h-12 w-full items-center gap-3 text-sm font-bold';
  return (
    <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-14">
      <aside className="space-y-6 lg:sticky lg:top-28">
        <section className="flex items-center gap-6" aria-label="プロフィール">
          <ProfileSeat id={userId} roles={profile.play_roles} rank={profile.rank_band} avatar={profile.avatar ?? null} />
          <div className="min-w-0">
            <h1 className="font-black tracking-[-0.01em] truncate text-[24px] leading-tight">{profile.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span className="font-bold">{rankLabel(profile.rank_band)}</span>
              {profile.play_roles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1">
                  <RoleIcon role={r} className="size-3.5" />
                  {PLAY_ROLE_LABELS[r]}
                </span>
              ))}
            </p>
          </div>
        </section>
        <Link href="/profile/edit" className="btn-outline w-full">
          <Pencil className="size-4" aria-hidden />
          プロフィールを編集
        </Link>

        {!hasContacts && (
          <Link href="/profile/edit#contacts" className="flex items-center gap-3 border-2 border-ink p-3">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">連絡先を追加</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-slate" aria-hidden />
          </Link>
        )}

        <section className="space-y-3 border-t-2 border-ink pt-6" aria-labelledby="push-title">
          <h2 id="push-title" className="section-title">通知</h2>
          <p className="text-[13px] leading-relaxed text-slate">
            参加の申請や承認、チャット、メンバーがそろったとき、一緒に遊んだ人の募集を、この端末にすぐお知らせします。アプリを開いていなくても届きます。
          </p>
          <PushToggle />
        </section>

        {(accountKind === 'anonymous' || accountKind === 'transfer') && (
          <section className="space-y-3 border-t-2 border-ink pt-6" aria-labelledby="transfer-title">
            <h2 id="transfer-title" className="section-title">別の端末でも使う</h2>
            <p className="text-[13px] leading-relaxed text-slate">
              このプロフィールは、この端末のブラウザにだけ保存されています。機種変更やブラウザのデータ削除に備えて、引き継ぎコードを作って保存しておいてください。
            </p>
            <TransferIssue email={transferEmail} initialCode={previewTransferCode} />
          </section>
        )}

        <nav className="hidden divide-y divide-line border-y-2 border-ink lg:block" aria-label="アカウント">
          <AccountMenu userId={userId} loginId={loginId} isAdmin={isAdmin} menu={menu} warnNoWayBack={warnNoWayBack} />
        </nav>
      </aside>

      <div className="mt-12 min-w-0 space-y-12 lg:mt-0">
        <section className="space-y-3" aria-labelledby="mine-title">
          <h2 id="mine-title" className="section-title">自分の募集</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-slate">
              ありません
            </p>
          ) : (
            <div className="grid gap-4">
              {mine.map((r) => (
                <RecruitmentCard key={r.id} r={r} now={now} auth="ready" viewerId={userId} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="joined-title">
          <h2 id="joined-title" className="section-title">参加中・申請中</h2>
          {joined.length === 0 ? (
            <p className="text-sm text-slate">ありません</p>
          ) : (
            <div className="grid gap-4">
              {joined.map((p) => (
                <RecruitmentCard key={p.recruitment.id} r={p.recruitment} now={now} auth="ready" viewerId={userId} myState={p.status} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="mates-title">
          <h2 id="mates-title" className="section-title">一緒に遊んだ人</h2>
          <p className="text-[13px] text-slate">ベルがオンの方が募集を出すと、通知が届きます。</p>
          {mates.length === 0 ? (
            <p className="text-sm text-slate">まだいません</p>
          ) : (
            <ul className="divide-y divide-ink/15 border-y-2 border-ink">
              {mates.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <Link href={`/users/${m.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
                    <MiniSeat id={m.id} roles={m.play_roles} avatar={m.avatar ?? null} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-black">{m.display_name}</span>
                      <span className="block font-mono text-[11px] text-slate">
                        {rankLabel(m.rank_band)} / {m.times}回
                      </span>
                    </span>
                  </Link>
                  <FollowButton userId={m.id} initial={m.following} compact />
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="divide-y divide-line border-y-2 border-ink lg:hidden" aria-label="アカウント">
          <AccountMenu userId={userId} loginId={loginId} isAdmin={isAdmin} menu={menu} warnNoWayBack={warnNoWayBack} />
        </nav>
      </div>
    </div>
  );
}

function AccountMenu({
  userId,
  loginId,
  isAdmin,
  menu,
  warnNoWayBack,
}: {
  userId: string;
  loginId: string | null;
  isAdmin: boolean;
  menu: string;
  warnNoWayBack: boolean;
}) {
  const icon = 'size-5 text-slate';
  return (
    <>
      <Link href={`/users/${userId}`} className={menu}>
        <UserRound className={icon} aria-hidden />
        <span className="flex-1">公開プロフィール</span>
        <ChevronRight className="size-4 text-slate" aria-hidden />
      </Link>
      <Link href="/me/blocks" className={menu}>
        <ShieldBan className={icon} aria-hidden />
        <span className="flex-1">ブロックしたユーザー</span>
        <ChevronRight className="size-4 text-slate" aria-hidden />
      </Link>
      {isAdmin && (
        <Link href="/admin" className={menu}>
          <Shield className={icon} aria-hidden />
          <span className="flex-1">管理画面</span>
          <ChevronRight className="size-4 text-slate" aria-hidden />
        </Link>
      )}
      <SignOutButton className={menu} warnNoWayBack={warnNoWayBack} />
    </>
  );
}
