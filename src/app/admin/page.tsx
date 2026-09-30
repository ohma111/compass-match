import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatJst } from '@/lib/time';
import { ActionButton } from '@/components/ActionButton';
import { adminDeleteRecruitmentAction, adminResolveAction, adminUserAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '管理画面', robots: { index: false } };

interface ReportRow {
  target_type: 'user' | 'recruitment' | 'message';
  target_id: string;
  target_owner: string | null;
  target_label: string | null;
  reporter_count: number;
  reasons: string[];
  latest_at: string;
  is_hidden: boolean | null;
}

const TYPE_LABEL = { user: 'ユーザー', recruitment: '募集', message: 'チャット' } as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer('/admin');
  // UIの出し分けのみ。実際の権限はDB側(RLS / private.require_admin)で強制している
  if (!viewer.isAdmin) notFound();
  const sp = await searchParams;
  const tab = sp.tab ?? 'reports';
  const supabase = await createClient();

  const tabs = [
    { key: 'reports', label: '通報' },
    { key: 'users', label: 'ユーザー' },
    { key: 'recruitments', label: '募集' },
    { key: 'feedback', label: 'フィードバック' },
    { key: 'metrics', label: '指標' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">管理画面</h1>
      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.key ? 'border-brand bg-brand/15 font-bold text-brand' : 'border-line'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'reports' && <ReportsTab supabase={supabase} />}
      {tab === 'users' && <UsersTab supabase={supabase} q={sp.q ?? ''} />}
      {tab === 'recruitments' && <RecruitmentsTab supabase={supabase} />}
      {tab === 'feedback' && <FeedbackTab supabase={supabase} />}
      {tab === 'metrics' && <MetricsTab supabase={supabase} />}
    </div>
  );
}

type SB = Awaited<ReturnType<typeof createClient>>;

async function ReportsTab({ supabase }: { supabase: SB }) {
  const [{ data, error }, { data: stats }] = await Promise.all([
    supabase.rpc('admin_report_summary'),
    supabase.rpc('admin_reporter_stats'),
  ]);
  if (error) return <p className="alert-error">取得できませんでした</p>;
  const rows = (data ?? []) as ReportRow[];
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">未処理の通報を対象ごとに集計しています。異なる3人以上から通報された対象は自動で非表示になっています。</p>
      {rows.length === 0 && <p className="text-sm">未処理の通報はありません。</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={`${r.target_type}:${r.target_id}`} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="chip-brand">{TYPE_LABEL[r.target_type]}</span>
              <span className="font-bold">{r.target_label ?? '(削除済み)'}</span>
              <span className="text-danger">通報者 {r.reporter_count}人</span>
              {r.is_hidden && <span className="chip">自動非表示中</span>}
              <span className="ml-auto text-xs text-muted">{formatJst(r.latest_at)}</span>
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {r.reasons.slice(0, 5).map((reason, i) => (
                <li key={i} className="break-words">{reason}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {r.target_type === 'recruitment' && (
                <Link href={`/recruitments/${r.target_id}`} className="btn-outline btn-sm">募集を見る</Link>
              )}
              {r.target_owner && (
                <Link href={`/admin?tab=users&q=${r.target_owner}`} className="btn-outline btn-sm">投稿者を確認</Link>
              )}
              <ActionButton action={adminResolveAction.bind(null, r.target_type, r.target_id, true)} className="btn-outline btn-sm">
                問題なし(表示に戻す)
              </ActionButton>
              {r.target_type === 'recruitment' && (
                <ActionButton action={adminDeleteRecruitmentAction.bind(null, r.target_id)} className="btn-danger btn-sm" confirm="募集を削除しますか?">
                  募集を削除
                </ActionButton>
              )}
              {r.target_type === 'message' && (
                <ActionButton action={adminResolveAction.bind(null, 'message', r.target_id, false)} className="btn-danger btn-sm" confirm="メッセージを削除しますか?">
                  メッセージを削除
                </ActionButton>
              )}
              {r.target_owner && (
                <ActionButton action={adminUserAction.bind(null, r.target_owner, 'ban')} className="btn-danger btn-sm" confirm="この投稿者をBANしますか?">
                  投稿者をBAN
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <section className="space-y-2">
        <h2 className="font-bold">通報者ごとの件数 (悪用監視用・自動処理なし)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted"><th>通報者</th><th>累計</th><th>30日</th></tr>
          </thead>
          <tbody>
            {((stats ?? []) as { reporter_id: string; display_name: string | null; total: number; last_30d: number }[]).map((s) => (
              <tr key={s.reporter_id} className="border-t border-line">
                <td className="py-1"><Link className="link" href={`/admin?tab=users&q=${s.reporter_id}`}>{s.display_name ?? '(不明)'}</Link></td>
                <td>{s.total}</td>
                <td>{s.last_30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function UsersTab({ supabase, q }: { supabase: SB; q: string }) {
  let query = supabase
    .from('profiles')
    .select('id, display_name, rank_band, hidden_at, suspended_at, banned_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const isUuid = /^[0-9a-f-]{36}$/i.test(q);
  if (isUuid) query = query.eq('id', q);
  else if (q) query = query.ilike('display_name', `%${q.replace(/[%_\\]/g, '')}%`);
  const { data } = await query;
  const rows = (data ?? []) as { id: string; display_name: string; hidden_at: string | null; suspended_at: string | null; banned_at: string | null; created_at: string }[];
  return (
    <div className="space-y-3">
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="users" />
        <input name="q" defaultValue={q} className="input" placeholder="表示名 または ユーザーID" />
        <button className="btn-outline shrink-0">検索</button>
      </form>
      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id} className="card space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/users/${u.id}`} className="font-bold link">{u.display_name}</Link>
              {u.banned_at && <span className="chip text-danger">BAN</span>}
              {u.suspended_at && <span className="chip text-warn">停止中</span>}
              {u.hidden_at && <span className="chip">通報で非表示</span>}
              <span className="ml-auto text-xs text-muted">登録 {formatJst(u.created_at)}</span>
            </div>
            <p className="break-all text-[11px] text-muted">{u.id}</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={adminUserAction.bind(null, u.id, 'suspend')} className="btn-outline btn-sm" confirm="利用停止にしますか?">停止</ActionButton>
              <ActionButton action={adminUserAction.bind(null, u.id, 'ban')} className="btn-danger btn-sm" confirm="BANしますか? 進行中の募集は取り消されます。">BAN</ActionButton>
              <ActionButton action={adminUserAction.bind(null, u.id, 'restore')} className="btn-outline btn-sm" confirm="停止・BAN・非表示をすべて解除しますか?">復活</ActionButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function RecruitmentsTab({ supabase }: { supabase: SB }) {
  const { data } = await supabase
    .from('recruitments')
    .select('id, title, status, starts_at, hidden_at, src, owner:profiles!recruitments_owner_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; starts_at: string; hidden_at: string | null; src: string | null; owner: { display_name: string } | null }[];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="card flex flex-wrap items-center gap-2 py-3 text-sm">
          <Link href={`/recruitments/${r.id}`} className="font-bold link">{r.title}</Link>
          <span className="text-xs text-muted">{r.owner?.display_name}・{formatJst(r.starts_at)}・{r.status}{r.src ? `・src=${r.src}` : ''}</span>
          {r.hidden_at && <span className="chip">非表示</span>}
          <div className="ml-auto">
            <ActionButton action={adminDeleteRecruitmentAction.bind(null, r.id)} className="btn-danger btn-sm" confirm="この募集を削除しますか?">削除</ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function FeedbackTab({ supabase }: { supabase: SB }) {
  const { data } = await supabase
    .from('feedback')
    .select('id, body, page, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as { id: string; body: string; page: string | null; created_at: string; user_id: string | null }[];
  return (
    <ul className="space-y-2">
      {rows.length === 0 && <li className="text-sm">フィードバックはまだありません。</li>}
      {rows.map((f) => (
        <li key={f.id} className="card space-y-1 py-3">
          <p className="whitespace-pre-wrap break-words text-sm">{f.body}</p>
          <p className="text-xs text-muted">
            {formatJst(f.created_at)}{f.page ? `・${f.page}` : ''}{f.user_id ? '・ログイン中' : '・未ログイン'}
          </p>
        </li>
      ))}
    </ul>
  );
}

async function MetricsTab({ supabase }: { supabase: SB }) {
  const { data, error } = await supabase.rpc('admin_metrics');
  if (error || !data) return <p className="alert-error">取得できませんでした</p>;
  const m = data as Record<string, unknown>;
  const kv = (obj: unknown) =>
    Object.entries((obj ?? {}) as Record<string, number>).map(([k, v]) => (
      <li key={k}>{k}: {v}</li>
    ));
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">直近30日。合格ライン: 登録30人以上 / ギルド外の人が参加した募集5件以上 / 実際に遊べた組3組以上</p>
      <div className="card grid grid-cols-2 gap-2">
        <div>登録者(累計)<p className="text-xl font-bold">{String(m.users_total)}</p></div>
        <div>登録者(30日)<p className="text-xl font-bold">{String(m.users_since)}</p></div>
        <div>募集数<p className="text-xl font-bold">{String(m.recruitments_since)}</p></div>
        <div>満員になった募集<p className="text-xl font-bold">{String(m.recruitments_filled)}</p></div>
        <div>埋まらず終了<p className="text-xl font-bold">{String(m.recruitments_ended_unfilled)}</p></div>
        <div>埋まるまで(平均分)<p className="text-xl font-bold">{String(m.avg_minutes_to_fill ?? '―')}</p></div>
      </div>
      <div className="card space-y-1">
        <p className="font-bold">承認された参加の流入元 (src)</p>
        <ul>{kv(m.approved_by_src)}</ul>
        <p className="font-bold">承認参加があった募集数 (参加者の流入元別)</p>
        <ul>{kv(m.recruitments_with_approved_src)}</ul>
        <p className="font-bold">募集の流入元</p>
        <ul>{kv(m.recruitments_by_src)}</ul>
        <p className="font-bold">登録時の流入元</p>
        <ul>{kv(m.signups_by_src)}</ul>
      </div>
      <p className="text-xs text-muted">
        ギルド内向けの告知には <code>?src=guild</code>、X には <code>?src=x</code> などを付けてリンクを共有すると、「guild以外」をギルド外の参加として数えられます。
      </p>
    </div>
  );
}
