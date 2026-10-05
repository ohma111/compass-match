import Link from 'next/link';
import { Ban, Wrench } from 'lucide-react';
import { formatJst, formatJstRange } from '@/lib/time';
import { APPEAL_PAGE, type SiteStatus } from '@/lib/site-status-shared';
import { FeedbackForm } from './FeedbackForm';

/** メンテナンス中、管理者以外に出す画面 (ページの中身の代わり) */
export function MaintenanceScreen({ status }: { status: SiteStatus }) {
  const until = status.ends_at && new Date(status.ends_at).getTime() > Date.now() && (!status.starts_at || new Date(status.starts_at).getTime() <= Date.now());
  return (
    <section className="mx-auto max-w-lg space-y-6 py-10" aria-labelledby="mt-title">
      <Wrench className="size-10" aria-hidden />
      <h1 id="mt-title" className="font-black tracking-[-0.01em] text-balance text-[28px] leading-tight lg:text-[36px]">
        ただいまメンテナンス中です
      </h1>
      {until && !status.manual_on && (
        <p className="border-y-2 border-ink py-3 font-mono text-lg font-bold">{formatJst(status.ends_at!)} ごろまで</p>
      )}
      {status.message && <p className="whitespace-pre-wrap leading-relaxed">{status.message}</p>}
      <p className="text-sm text-slate">終わりましたら、このページを再読み込みしてください。</p>
    </section>
  );
}

/** メンテナンスの予定 (始まる前に、全ページの上に出す帯) */
export function MaintenancePlanned({ status }: { status: SiteStatus }) {
  if (!status.starts_at || !status.ends_at || status.active) return null;
  if (new Date(status.ends_at).getTime() <= Date.now()) return null;
  return (
    <p className="mb-6 flex items-start gap-2 border-2 border-ink bg-sheet px-3 py-2 text-[13px] font-bold">
      <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{formatJstRange(status.starts_at, status.ends_at)} はメンテナンスのため、ご利用いただけません。</span>
    </p>
  );
}

/** BAN されたアカウントに出す画面 (ページの中身の代わり)。異議申し立てを送れる */
export function BanScreen({ bannedAt }: { bannedAt: string }) {
  return (
    <section className="mx-auto max-w-lg space-y-6 py-10" aria-labelledby="ban-title">
      <Ban className="size-10 text-signal-deep" aria-hidden />
      <h1 id="ban-title" className="font-black tracking-[-0.01em] text-balance text-[28px] leading-tight lg:text-[36px]">
        このアカウントは利用停止 (BAN) されています
      </h1>
      <p className="leading-relaxed">
        <Link href="/terms" className="link">利用規約</Link>
        の禁止事項に当たると判断したため、{formatJst(bannedAt)} からこのアカウントでの利用を停止しています。
      </p>
      <div className="space-y-3 border-t-2 border-ink pt-6">
        <h2 className="text-lg font-black">異議申し立て</h2>
        <p className="text-sm text-slate">心当たりがない場合は、理由を書いて送信してください。返信はできませんが、運営者が内容を確認します。</p>
        <FeedbackForm page={APPEAL_PAGE} placeholder="異議の内容 (個人情報は書かないでください)" submitLabel="異議申し立てを送信する" />
      </div>
    </section>
  );
}
