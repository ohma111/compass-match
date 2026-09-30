import Link from 'next/link';
import { ChevronRight, LogOut, MessageSquareHeart, Pencil, Shield, ShieldBan, FileText, UserRound } from 'lucide-react';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RecruitmentCard } from '@/components/RecruitmentCard';
import { Avatar } from '@/components/Avatar';
import { signOutAction } from '@/app/actions';
import { PLAY_ROLE_LABELS, RANK_LABELS } from '@/lib/constants';
import { RECRUIT_BASE_COLUMNS } from '@/lib/queries';
import type { Recruitment } from '@/lib/types';
import type { JoinState } from '@/lib/capacity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'マイページ' };

const OWNER_COLUMNS = `${RECRUIT_BASE_COLUMNS}, owner:profiles!recruitments_owner_id_fkey(id, display_name, rank_band)`;

export default async function MePage() {
  const viewer = await requireViewer('/me');
  const profile = viewer.profile!;
  const supabase = await createClient();
  const now = new Date();
  const [{ data: mine }, { data: parts }, { data: contacts }] = await Promise.all([
    supabase
      .from('recruitments')
      .select(OWNER_COLUMNS)
      .eq('owner_id', viewer.userId)
      .in('status', ['open', 'full'])
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(10),
    supabase
      .from('participations')
      .select(`status, recruitment:recruitments(${OWNER_COLUMNS})`)
      .eq('user_id', viewer.userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('profile_contacts').select('contact_discord, contact_x, contact_ingame').eq('user_id', viewer.userId).maybeSingle(),
  ]);
  const joined = ((parts ?? []) as unknown as { status: JoinState; recruitment: Recruitment | null }[]).filter(
    (p) => p.recruitment && new Date(p.recruitment.ends_at).getTime() > now.getTime(),
  );
  const hasContacts = Boolean(contacts && (contacts.contact_discord || contacts.contact_x || contacts.contact_ingame));
  const menu = 'flex min-h-12 items-center gap-3 px-4 text-sm font-bold';

  return (
    <div className="space-y-6">
      <section className="card flex items-center gap-4">
        <Avatar name={profile.display_name} seed={viewer.userId} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{profile.display_name}</p>
          <p className="text-xs text-muted">
            {RANK_LABELS[profile.rank_band]}
            {profile.play_roles.length > 0 && `・${profile.play_roles.map((r) => PLAY_ROLE_LABELS[r]).join('/')}`}
          </p>
        </div>
        <Link href="/profile/edit" className="btn-outline btn-sm shrink-0">
          <Pencil className="size-4" aria-hidden />
          編集
        </Link>
      </section>

      {!hasContacts && (
        <Link href="/profile/edit#contacts" className="card flex items-center gap-3 border-brand/40">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-bold">連絡先を追加しませんか?</span>
            <span className="text-xs text-muted">参加が確定した相手にだけ表示されます(任意)</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
      )}

      <section className="space-y-2">
        <h2 className="section-title">MY RECRUITMENTS</h2>
        {(mine ?? []).length === 0 && (
          <p className="card text-sm text-muted">
            進行中の募集はありません。<Link href="/recruitments/new" className="link">募集する</Link>
          </p>
        )}
        <div className="space-y-3">
          {((mine ?? []) as unknown as Recruitment[]).map((r) => (
            <RecruitmentCard key={r.id} r={r} now={now} auth="ready" viewerId={viewer.userId} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="section-title">JOINED</h2>
        {joined.length === 0 && <p className="card text-sm text-muted">参加中・申請中の募集はありません。</p>}
        <div className="space-y-3">
          {joined.map((p) => (
            <RecruitmentCard key={p.recruitment!.id} r={p.recruitment!} now={now} auth="ready" viewerId={viewer.userId} myState={p.status} />
          ))}
        </div>
      </section>

      <nav className="card divide-y divide-line/70 p-0" aria-label="その他">
        <Link href={`/users/${viewer.userId}`} className={menu}>
          <UserRound className="size-5 text-muted" aria-hidden />
          <span className="flex-1">公開プロフィールを見る</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        <Link href="/me/blocks" className={menu}>
          <ShieldBan className="size-5 text-muted" aria-hidden />
          <span className="flex-1">ブロックしたユーザー</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        <Link href="/feedback" className={menu}>
          <MessageSquareHeart className="size-5 text-muted" aria-hidden />
          <span className="flex-1">フィードバックを送る</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        <Link href="/terms" className={menu}>
          <FileText className="size-5 text-muted" aria-hidden />
          <span className="flex-1">利用規約・プライバシー</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        {viewer.isAdmin && (
          <Link href="/admin" className={menu}>
            <Shield className="size-5 text-muted" aria-hidden />
            <span className="flex-1">管理画面</span>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        )}
        <form action={signOutAction}>
          <button className={`${menu} w-full text-danger`}>
            <LogOut className="size-5" aria-hidden />
            ログアウト
          </button>
        </form>
      </nav>
    </div>
  );
}
