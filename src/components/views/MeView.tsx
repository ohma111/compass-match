import Link from 'next/link';
import { ChevronRight, FileText, MessageSquareHeart, Pencil, Shield, ShieldBan, UserRound } from 'lucide-react';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { RoleIcon } from '@/components/RoleIcon';
import { ReissueRecoveryCode } from '@/components/ReissueRecoveryCode';
import { SignOutButton } from '@/components/SignOutButton';
import { TransferIssue } from '@/components/TransferForms';
import type { AccountKind } from '@/lib/transfer';
import { PLAY_ROLE_LABELS, RANK_LABELS } from '@/lib/constants';
import type { Profile, Recruitment } from '@/lib/types';
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
  now: Date;
}

export function MeView({ userId, profile, loginId, accountKind, transferEmail, previewTransferCode, isAdmin, hasContacts, mine, joined, now }: MeViewProps) {
  const warnNoWayBack = accountKind === 'anonymous';
  const menu = 'flex min-h-12 w-full items-center gap-3 text-sm font-bold';
  const initial = Array.from(profile.display_name.trim())[0] ?? '?';
  return (
    <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-14">
      <aside className="space-y-6 lg:sticky lg:top-28">
        <section className="flex items-center gap-6" aria-label="プロフィール">
          <div className="ml-3 flex h-28 w-22 shrink-0 items-end bg-ink px-3 pb-3 text-white [transform:skewX(var(--seat-skew))]">
            <span className="font-display text-[44px] leading-none [transform:skewX(calc(var(--seat-skew)*-1))]" aria-hidden>
              {initial}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display truncate text-[24px] leading-tight">{profile.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span className="font-bold">{RANK_LABELS[profile.rank_band]}</span>
              {profile.play_roles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1">
                  <RoleIcon role={r} className="size-3.5" />
                  {PLAY_ROLE_LABELS[r]}
                </span>
              ))}
            </p>
            {loginId && (
              <p className="mt-1 text-xs text-slate">
                ユーザーID <span className="font-bold text-ink-2">{loginId}</span>
              </p>
            )}
          </div>
        </section>
        <Link href="/profile/edit" className="btn-outline w-full">
          <Pencil className="size-4" aria-hidden />
          プロフィールを編集
        </Link>

        {!hasContacts && (
          <Link href="/profile/edit#contacts" className="flex items-center gap-3 border-l-4 border-ally bg-sheet p-3">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">連絡先を追加する (任意)</span>
              <span className="text-xs text-slate">パーティが決まった相手にだけ見えます</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-slate" aria-hidden />
          </Link>
        )}

        {(accountKind === 'anonymous' || accountKind === 'transfer') && (
          <section className="space-y-3 border-t-2 border-ink pt-6" aria-labelledby="transfer-title">
            <h2 id="transfer-title" className="section-title">別の端末でも使う</h2>
            <TransferIssue email={transferEmail} initialCode={previewTransferCode} />
          </section>
        )}

        <nav className="hidden divide-y divide-line border-y-2 border-ink lg:block" aria-label="アカウント">
          <AccountMenu userId={userId} loginId={loginId} isAdmin={isAdmin} menu={menu} warnNoWayBack={warnNoWayBack} />
        </nav>
      </aside>

      <div className="mt-12 space-y-12 lg:mt-0 xl:grid xl:grid-cols-2 xl:items-start xl:gap-8 xl:space-y-0">
        <section className="space-y-3" aria-labelledby="mine-title">
          <h2 id="mine-title" className="section-title">自分の募集</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-slate">
              今出している募集はありません。<Link href="/recruitments/new" className="link">募集を出す</Link>
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
            <p className="text-sm text-slate">参加中・申請中の募集はありません。気になる募集の席に入ってみてください。</p>
          ) : (
            <div className="grid gap-4">
              {joined.map((p) => (
                <RecruitmentCard key={p.recruitment.id} r={p.recruitment} now={now} auth="ready" viewerId={userId} myState={p.status} />
              ))}
            </div>
          )}
        </section>

        <nav className="divide-y divide-line border-y-2 border-ink lg:hidden xl:col-span-2" aria-label="アカウント">
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
        <span className="flex-1">ほかの人から見えるプロフィール</span>
        <ChevronRight className="size-4 text-slate" aria-hidden />
      </Link>
      {loginId && <ReissueRecoveryCode loginId={loginId} />}
      <Link href="/me/blocks" className={menu}>
        <ShieldBan className={icon} aria-hidden />
        <span className="flex-1">ブロックしたユーザー</span>
        <ChevronRight className="size-4 text-slate" aria-hidden />
      </Link>
      <Link href="/feedback" className={menu}>
        <MessageSquareHeart className={icon} aria-hidden />
        <span className="flex-1">フィードバックを送る</span>
        <ChevronRight className="size-4 text-slate" aria-hidden />
      </Link>
      <Link href="/terms" className={menu}>
        <FileText className={icon} aria-hidden />
        <span className="flex-1">利用規約・プライバシー</span>
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
