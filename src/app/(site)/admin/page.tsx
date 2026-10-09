import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatJst } from '@/lib/time';
import { ActionButton } from '@/components/ActionButton';
import {
  adminDeleteFeedbackAction,
  adminDeleteInactiveUsersAction,
  adminDeleteRecruitmentAction,
  adminDeleteRecruitmentLogsAction,
  adminDeleteReportsAction,
  adminDeleteUserAction,
  adminResolveAction,
  adminRunCleanupAction,
  adminUserAction,
} from '@/app/actions';
import { PURPOSE_LABELS } from '@/lib/constants';
import { APPEAL_PAGE, maintenanceNotice, type SiteStatus } from '@/lib/site-status';
import { AnnounceForm, MaintenanceForm } from './AdminForms';
import { LiveDbSize } from './LiveDbSize';
import { UserBulkForm } from './UserBulkForm';

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
  /** 通報された人 (ユーザーならその人、募集なら募集者、チャットなら発言者) の表示名 */
  owner_name: string | null;
  reports: { reporter_id: string; reporter_name: string | null; reason: string; at: string }[] | null;
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
    { key: 'usage', label: '容量' },
    { key: 'maintenance', label: 'メンテナンス・お知らせ' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[34px]">管理画面</h1>
      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={`inline-flex min-h-11 items-center border-2 px-3 text-sm font-bold ${tab === t.key ? 'border-ink bg-ink text-white' : 'border-ink/25'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'reports' && <ReportsTab supabase={supabase} />}
      {tab === 'users' && <UsersTab supabase={supabase} q={sp.q ?? ''} page={pageOf(sp.page)} />}
      {tab === 'recruitments' && <RecruitmentsTab supabase={supabase} from={sp.from} to={sp.to} page={pageOf(sp.page)} />}
      {tab === 'feedback' && <FeedbackTab supabase={supabase} />}
      {tab === 'metrics' && <MetricsTab supabase={supabase} />}
      {tab === 'usage' && <UsageTab supabase={supabase} />}
      {tab === 'maintenance' && <MaintenanceTab supabase={supabase} />}
    </div>
  );
}

type SB = Awaited<ReturnType<typeof createClient>>;

/** 一覧は10件ずつ */
const PAGE_SIZE = 10;
function pageOf(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function Pager({ tab, page, total, extra }: { tab: string; page: number; total: number; extra?: Record<string, string> }) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (last <= 1) return null;
  const href = (p: number) => `/admin?${new URLSearchParams({ tab, ...(extra ?? {}), page: String(p) }).toString()}`;
  const around = [...new Set([1, page - 1, page, page + 1, last])].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const cell = 'inline-flex min-h-11 min-w-11 items-center justify-center border-2 px-2 font-mono text-sm font-bold';
  return (
    <nav className="flex flex-wrap items-center gap-1.5 pt-2" aria-label="ページ">
      {page > 1 && <Link href={href(page - 1)} className={`${cell} border-ink/25`}>前へ</Link>}
      {around.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - around[i - 1] > 1 && <span className="px-1 text-slate">…</span>}
          <Link href={href(p)} aria-current={p === page ? 'page' : undefined} className={`${cell} ${p === page ? 'border-ink bg-ink text-white' : 'border-ink/25'}`}>
            {p}
          </Link>
        </span>
      ))}
      {page < last && <Link href={href(page + 1)} className={`${cell} border-ink/25`}>次へ</Link>}
      <span className="ml-auto text-xs text-slate">{page} / {last} ページ</span>
    </nav>
  );
}

async function ReportsTab({ supabase }: { supabase: SB }) {
  const [{ data, error }, { data: stats }] = await Promise.all([
    supabase.rpc('admin_report_summary'),
    supabase.rpc('admin_reporter_stats'),
  ]);
  if (error) return <p className="alert-error">データを取得できませんでした</p>;
  const rows = (data ?? []) as ReportRow[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">未処理の通報を対象ごとにまとめています。3人以上から通報された対象は自動で非表示になります。</p>
        <ActionButton action={adminDeleteReportsAction.bind(null, null, null, true)} className="btn-outline btn-sm" confirm="処理済みの通報をすべて削除しますか？">
          処理済みの通報を削除
        </ActionButton>
      </div>
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
            <p className="text-sm">
              <span className="font-bold text-slate">通報された人</span>{' '}
              {r.target_owner ? (
                <Link href={`/admin?tab=users&q=${r.target_owner}`} className="link font-bold">
                  {r.owner_name ?? '(名前なし)'}
                </Link>
              ) : (
                '(削除済み)'
              )}
            </p>
            <ul className="divide-y divide-line border-y border-line text-sm">
              {(r.reports ?? []).slice(0, 10).map((x, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                  <span className="min-w-0 flex-1 break-words">{x.reason}</span>
                  <span className="shrink-0 text-xs text-muted">
                    通報した人{' '}
                    <Link href={`/admin?tab=users&q=${x.reporter_id}`} className="link font-bold text-ink">
                      {x.reporter_name ?? '(削除済み)'}
                    </Link>
                    ・{formatJst(x.at)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {r.target_type === 'recruitment' && (
                <Link href={`/recruitments/${r.target_id}`} className="btn-outline btn-sm">募集を見る</Link>
              )}
              <ActionButton action={adminDeleteReportsAction.bind(null, r.target_type, r.target_id, false)} className="btn-ghost btn-sm" confirm="この対象への通報を削除しますか？ (対象そのものは残ります)">
                通報を削除
              </ActionButton>
              <ActionButton action={adminResolveAction.bind(null, r.target_type, r.target_id, true)} className="btn-outline btn-sm">
                問題なし(表示に戻す)
              </ActionButton>
              {r.target_type === 'recruitment' && (
                <ActionButton action={adminDeleteRecruitmentAction.bind(null, r.target_id)} className="btn-danger btn-sm" confirm="募集を削除しますか？">
                  募集を削除
                </ActionButton>
              )}
              {r.target_type === 'message' && (
                <ActionButton action={adminResolveAction.bind(null, 'message', r.target_id, false)} className="btn-danger btn-sm" confirm="メッセージを削除しますか？">
                  メッセージを削除
                </ActionButton>
              )}
              {r.target_owner && (
                <ActionButton
                  action={adminUserAction.bind(null, r.target_owner, 'ban')}
                  className="btn-danger btn-sm"
                  confirm={`通報された人 (${r.owner_name ?? '名前なし'}) をBANしますか？`}
                >
                  通報された人をBAN
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <section className="space-y-2">
        <h2 className="font-bold">通報者ごとの件数 (通報の悪用を確認するためのもので、自動では処理しません)</h2>
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

async function UsersTab({ supabase, q, page }: { supabase: SB; q: string; page: number }) {
  const { data, error } = await supabase.rpc('admin_list_users', { p_q: q, p_page: page });
  if (error || !data) return <p className="alert-error">データを取得できませんでした</p>;
  const res = data as {
    total: number;
    rows: { id: string; display_name: string; rank_band: string | null; hidden_at: string | null; banned_at: string | null; created_at: string; last_seen_at: string | null; is_anonymous: boolean; is_admin: boolean }[];
  };
  const rows = res.rows;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        登録している人 <span className="font-mono text-xl font-bold">{res.total}</span> 人{q ? ` (「${q}」で検索)` : ''}
      </p>
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="users" />
        <input name="q" defaultValue={q} className="input" placeholder="表示名 または ユーザーID" />
        <button className="btn-outline shrink-0">検索</button>
      </form>
      <dl className="grid gap-1 text-xs text-slate sm:grid-cols-2">
        <div><dt className="inline font-bold text-ink">BAN</dt><dd className="inline">: アカウントは残し、サイトを使えなくします。本人には BAN の画面と異議申し立ての欄が出ます。解除できます。</dd></div>
        <div><dt className="inline font-bold text-ink">削除</dt><dd className="inline">: アカウントとプロフィール・募集・チャットを消します。元に戻せません。</dd></div>
      </dl>
      <UserBulkForm>
      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id} className="card space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {!u.is_admin && (
                <input type="checkbox" name="uid" value={u.id} className="size-5 accent-[var(--color-ink)]" aria-label={`${u.display_name}さんを選ぶ`} />
              )}
              <Link href={`/users/${u.id}`} className="font-bold link">{u.display_name}</Link>
              {u.is_admin && <span className="chip">管理者</span>}
              <span className="chip">{u.is_anonymous ? '匿名' : '引き継ぎ・Discord'}</span>
              {u.banned_at && <span className="chip text-danger">BAN中</span>}
              {u.hidden_at && <span className="chip">通報で非表示</span>}
              <span className="ml-auto text-xs text-muted">
                登録 {formatJst(u.created_at)}
                {u.last_seen_at ? `・最終操作 ${formatJst(u.last_seen_at)}` : ''}
              </span>
            </div>
            <p className="break-all text-xs text-muted">{u.id}</p>
            <div className="flex flex-wrap gap-2">
              {u.banned_at ? (
                <ActionButton action={adminUserAction.bind(null, u.id, 'restore')} className="btn-outline btn-sm" confirm="BANを解除しますか？">BANを解除</ActionButton>
              ) : (
                <ActionButton action={adminUserAction.bind(null, u.id, 'ban')} className="btn-danger btn-sm" confirm="BANしますか？ 進行中の募集は取り消されます。">BAN</ActionButton>
              )}
              {u.hidden_at && !u.banned_at && (
                <ActionButton action={adminUserAction.bind(null, u.id, 'restore')} className="btn-outline btn-sm">非表示を解除</ActionButton>
              )}
              <ActionButton
                action={adminDeleteUserAction.bind(null, u.id)}
                className="btn-ghost btn-sm text-danger"
                confirm={`${u.display_name}さんのアカウントを削除しますか？ プロフィール・募集・チャットがすべて消え、元に戻せません。`}
              >
                削除
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
      </UserBulkForm>
      <Pager tab="users" page={page} total={res.total} extra={q ? { q } : undefined} />
    </div>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  active: '受付中',
  filled: '満員になった',
  unfilled: '埋まらず終了',
  cancelled: '取り消し',
  removed: '途中で削除',
};
const STANCE_LABEL: Record<string, string> = { win: '本気で勝ちたい', fun: '楽しく遊びたい', '': '未設定' };

function jstDay(offsetDays: number): string {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function Breakdown({ title, data, labels }: { title: string; data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold">{title}</p>
      {entries.length === 0 && <p className="text-xs text-muted">ありません</p>}
      <ul className="space-y-1 text-sm">
        {entries.map(([k, n]) => (
          <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2">
            <span className="truncate">{labels?.[k] ?? (k || '(なし)')}</span>
            <span className="h-2.5 bg-ink/10" aria-hidden>
              <span className="block h-full bg-ink" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function RecruitmentsTab({ supabase, from, to, page }: { supabase: SB; from?: string; to?: string; page: number }) {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const f = from && day.test(from) ? from : jstDay(-30);
  const t = to && day.test(to) ? to : jstDay(0);
  const [{ data, count }, statsRes] = await Promise.all([
    supabase
      .from('recruitments')
      .select('id, title, status, starts_at, hidden_at, src, owner:profiles!recruitments_owner_id_fkey(display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.rpc('admin_recruitment_stats', { p_from: f, p_to: t }),
  ]);
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; starts_at: string; hidden_at: string | null; src: string | null; owner: { display_name: string } | null }[];
  const st = (statsRes.data ?? null) as null | {
    total: number;
    live: number;
    archived: number;
    purpose: Record<string, number>;
    stance: Record<string, number>;
    outcome: Record<string, number>;
    src: Record<string, number>;
    days: { day: string; n: number }[];
  };
  const maxDay = Math.max(1, ...(st?.days ?? []).map((d) => d.n));
  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="stats-title">
        <h2 id="stats-title" className="font-bold">募集の集計</h2>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="recruitments" />
          <label className="text-xs font-bold">
            開始日
            <input type="date" name="from" defaultValue={f} className="input mt-1" />
          </label>
          <label className="text-xs font-bold">
            終了日
            <input type="date" name="to" defaultValue={t} className="input mt-1" />
          </label>
          <button className="btn-outline">集計する</button>
        </form>
        {statsRes.error || !st ? (
          <p className="alert-error">データを取得できませんでした</p>
        ) : (
          <>
            <p className="text-sm">
              {f} 〜 {t} の募集 <span className="font-mono text-xl font-bold">{st.total}</span> 件
              <span className="ml-2 text-xs text-muted">(残っている募集 {st.live} 件 + 削除済みの集計 {st.archived} 件)</span>
            </p>
            {st.days.length > 0 && (
              <div className="flex h-24 items-end gap-px border-b-2 border-ink" role="img" aria-label="日ごとの募集数">
                {st.days.map((d) => (
                  <span key={d.day} title={`${d.day}: ${d.n}件`} className="min-w-0 flex-1 bg-ink" style={{ height: `${(d.n / maxDay) * 100}%` }} />
                ))}
              </div>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <Breakdown title="目的" data={st.purpose} labels={PURPOSE_LABELS} />
              <Breakdown title="遊び方" data={st.stance} labels={STANCE_LABEL} />
              <Breakdown title="結果" data={st.outcome} labels={OUTCOME_LABEL} />
              <Breakdown title="流入元 (src)" data={st.src} />
            </div>
          </>
        )}
        <div className="space-y-2 border-t-2 border-line pt-4">
          <p className="text-sm font-bold">この期間の募集ログを削除</p>
          <p className="text-xs text-muted">終わった募集と取り消された募集が対象です (受付中の募集は消しません)。</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action={adminDeleteRecruitmentLogsAction.bind(null, f, t, false)}
              className="btn-outline btn-sm"
              confirm={`${f} 〜 ${t} の募集を削除しますか？ 件数の集計は残ります。`}
            >
              募集を削除 (集計は残す)
            </ActionButton>
            <ActionButton
              action={adminDeleteRecruitmentLogsAction.bind(null, f, t, true)}
              className="btn-danger btn-sm"
              confirm={`${f} 〜 ${t} の募集と集計をすべて削除しますか？ 元に戻せません。`}
            >
              集計も含めて削除
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="recent-title">
        <h2 id="recent-title" className="font-bold">募集の一覧 (新しい順・{count ?? 0}件)</h2>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-2 py-3 text-sm">
              <Link href={`/recruitments/${r.id}`} className="font-bold link">{r.title}</Link>
              <span className="text-xs text-muted">{r.owner?.display_name}・{formatJst(r.starts_at)}・{r.status}{r.src ? `・src=${r.src}` : ''}</span>
              {r.hidden_at && <span className="chip">非表示</span>}
              <div className="ml-auto">
                <ActionButton action={adminDeleteRecruitmentAction.bind(null, r.id)} className="btn-danger btn-sm" confirm="この募集を削除しますか？">削除</ActionButton>
              </div>
            </li>
          ))}
        </ul>
        <Pager tab="recruitments" page={page} total={count ?? 0} extra={{ from: f, to: t }} />
      </section>
    </div>
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
      {rows.length > 0 && (
        <li className="flex justify-end">
          <ActionButton action={adminDeleteFeedbackAction.bind(null, null)} className="btn-outline btn-sm" confirm="フィードバックをすべて削除しますか？">
            すべて削除
          </ActionButton>
        </li>
      )}
      {rows.map((f) => (
        <li key={f.id} className={`card flex items-start gap-3 py-3 ${f.page === APPEAL_PAGE ? 'border-signal' : ''}`}>
          <div className="min-w-0 flex-1 space-y-1">
            {f.page === APPEAL_PAGE && <span className="chip text-signal-deep">BAN への異議申し立て</span>}
            <p className="whitespace-pre-wrap break-words text-sm">{f.body}</p>
            <p className="text-xs text-muted">
              {formatJst(f.created_at)}
              {f.page && f.page !== APPEAL_PAGE ? `・${f.page}` : ''}
              {f.user_id ? (
                <>
                  ・<Link className="link" href={`/admin?tab=users&q=${f.user_id}`}>送った人</Link>
                </>
              ) : (
                '・ログインなし'
              )}
            </p>
          </div>
          <ActionButton action={adminDeleteFeedbackAction.bind(null, f.id)} className="btn-ghost btn-sm" confirm="このフィードバックを削除しますか？" quiet>
            削除
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}

async function MaintenanceTab({ supabase }: { supabase: SB }) {
  const { data } = await supabase.rpc('site_status');
  const m = (data ?? null) as SiteStatus | null;
  return (
    <div className="space-y-10">
      <section className="space-y-3" aria-labelledby="mt-title">
        <h2 id="mt-title" className="font-bold">メンテナンス</h2>
        <p className="text-sm">
          今の状態: <span className={`font-bold ${m?.active ? 'text-signal-deep' : ''}`}>{m?.active ? 'メンテナンス中 (管理者以外は使えません)' : '通常'}</span>
        </p>
        <MaintenanceForm status={m} />
      </section>
      <section className="space-y-3" aria-labelledby="an-title">
        <h2 id="an-title" className="font-bold">お知らせを配信</h2>
        <p className="text-xs text-muted">全員の通知欄に届きます。プッシュ通知をオンにしている人には端末にも届きます。</p>
        <AnnounceForm suggestion={m?.starts_at && m.ends_at ? maintenanceNotice(m.starts_at, m.ends_at) : ''} />
      </section>
    </div>
  );
}

async function MetricsTab({ supabase }: { supabase: SB }) {
  const { data, error } = await supabase.rpc('admin_metrics');
  if (error || !data) return <p className="alert-error">データを取得できませんでした</p>;
  const m = data as Record<string, unknown>;
  const kv = (obj: unknown) =>
    Object.entries((obj ?? {}) as Record<string, number>).map(([k, v]) => (
      <li key={k}>{k}: {v}</li>
    ));
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">直近30日の数字です。目標は、登録30人以上、ギルド外の方が参加した募集5件以上、実際に遊べた組3組以上です。</p>
      <div className="card grid grid-cols-2 gap-2">
        <div>登録者(累計)<p className="text-xl font-bold">{String(m.users_total)}</p></div>
        <div>登録者(30日)<p className="text-xl font-bold">{String(m.users_since)}</p></div>
        <div>募集数<p className="text-xl font-bold">{String(m.recruitments_since)}</p></div>
        <div>満員になった募集<p className="text-xl font-bold">{String(m.recruitments_filled)}</p></div>
        <div>満員にならずに終了<p className="text-xl font-bold">{String(m.recruitments_ended_unfilled)}</p></div>
        <div>満員までの平均 (分)<p className="text-xl font-bold">{String(m.avg_minutes_to_fill ?? '―')}</p></div>
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

/** 容量の表の日本語名 */
const TABLE_NAMES: Record<string, string> = {
  'public.profiles': 'プロフィール',
  'public.profile_contacts': '連絡先',
  'public.recruitments': '募集',
  'public.recruitment_secrets': '部屋番号',
  'public.participations': '参加',
  'public.messages': 'チャット',
  'public.notifications': '通知',
  'public.reports': '通報',
  'public.feedback': 'フィードバック',
  'public.blocks': 'ブロック',
  'public.play_mates': '一緒に遊んだ記録',
  'public.follows': '募集の通知設定',
  'public.push_subscriptions': 'プッシュ通知の登録',
  'public.presence_now': '今から遊べる',
  'public.accounts': 'ユーザーID (旧方式)',
  'public.app_settings': '設定',
  'public.server_secrets': 'サーバーの鍵',
  'public.user_roles': '管理者',
  'auth.users': 'アカウント (認証)',
  'auth.sessions': 'ログイン中の端末',
  'auth.refresh_tokens': 'ログインの更新情報',
  'auth.audit_log_entries': '認証の記録',
  'auth.identities': 'ログイン方法',
  'auth.mfa_factors': '二段階認証',
  'auth.flow_state': 'ログインの途中経過',
  'auth.one_time_tokens': 'ワンタイムトークン',
  'cron.job_run_details': '定期処理の実行記録',
  'cron.job': '定期処理',
  'private.auth_attempts': '登録回数の記録',
  'private.play_mates_counted': '一緒に遊んだ記録 (内部)',
  'private.protected_users': '削除しないアカウント',
  'public.site_maintenance': 'メンテナンスの設定',
  'public.recruitment_stats_daily': '募集の日ごとの集計',
};

/** 無料枠の上限 (2026-10 時点。変わったらここを直す) */
const FREE_DB_BYTES = 500 * 1024 * 1024;
const FREE_MAU = 50_000;

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function UsageTab({ supabase }: { supabase: SB }) {
  const { data, error } = await supabase.rpc('admin_usage');
  if (error || !data) return <p className="alert-error">データを取得できませんでした (マイグレーションが未適用の可能性があります)</p>;
  const u = data as {
    db_bytes: number;
    tables: { name: string; bytes: number; rows: number }[];
    auth_users: number;
    anonymous_users: number;
    inactive_users?: number;
    recruitments: number;
    messages: number;
    notifications: number;
    reports?: number;
    feedback?: number;
  };
  const { data: inactive } = await supabase.rpc('admin_inactive_users');
  const inactiveRows = (inactive ?? []) as { id: string; display_name: string; last_seen_at: string }[];
  return (
    <div className="space-y-4 text-sm">
      <LiveDbSize initialBytes={u.db_bytes} />
      <div className="card">
        <p className="font-bold">大きい表</p>
        <ul className="mt-2 space-y-1 font-mono text-[13px]">
          {u.tables.map((t) => (
            <li key={t.name} className="flex justify-between gap-3">
              <span className="truncate">{TABLE_NAMES[t.name] ?? t.name}</span>
              <span className="shrink-0">{mb(t.bytes)} / {Math.max(0, t.rows)}行</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>アカウント<p className="text-xl font-bold">{u.auth_users}</p></div>
        <div>うち匿名アカウント<p className="text-xl font-bold">{u.anonymous_users}</p></div>
        <div>60日以上操作なし<p className="text-xl font-bold">{u.inactive_users ?? 0}</p></div>
        <div>募集<p className="text-xl font-bold">{u.recruitments}</p></div>
        <div>チャット<p className="text-xl font-bold">{u.messages}</p></div>
        <div>通知<p className="text-xl font-bold">{u.notifications}</p></div>
        <div>通報<p className="text-xl font-bold">{u.reports ?? 0}</p></div>
        <div>フィードバック<p className="text-xl font-bold">{u.feedback ?? 0}</p></div>
      </div>
      <div className="card space-y-3">
        <p className="font-bold">データを減らす</p>
        <p className="text-xs leading-relaxed text-muted">
          古いデータは5分ごとに自動で削除しています (チャットは募集終了の90分後、募集は15日後、通知は7日後、60日以上操作のないアカウントは削除。運営者の Discord アカウントと管理者は対象外)。今すぐ実行する場合は下のボタンを押してください。
        </p>
        <ActionButton action={adminRunCleanupAction} className="btn-outline btn-sm" confirm="古いデータを今すぐ削除しますか？">
          古いデータを今すぐ削除
        </ActionButton>
      </div>
      <div className="card space-y-3">
        <p className="font-bold">60日以上操作のないアカウント ({inactiveRows.length}件)</p>
        {inactiveRows.length === 0 ? (
          <p className="text-sm text-muted">ありません</p>
        ) : (
          <>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
              {inactiveRows.map((x) => (
                <li key={x.id} className="flex justify-between gap-3">
                  <span className="truncate">{x.display_name}</span>
                  <span className="shrink-0 text-xs text-muted">最終操作 {formatJst(x.last_seen_at)}</span>
                </li>
              ))}
            </ul>
            <ActionButton action={adminDeleteInactiveUsersAction} className="btn-danger btn-sm" confirm="これらのアカウントを削除しますか？ 元に戻せません。">
              まとめて削除
            </ActionButton>
          </>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        無料枠: データベース 500MB / 月間アクティブ {FREE_MAU.toLocaleString()}人 / 通信 5GB (Supabase)、関数の実行 100万回・CPU 4時間 (Vercel)。
        無料枠を超えても請求はされませんが、サービスが止まるか読み取り専用になります。通信量と実行回数はデータベースからは確認できないため、Supabase と Vercel の Usage 画面で確認してください。
      </p>
    </div>
  );
}
