// v8 の本番確認: いっしょに遊んだ人の募集通知 / 一般ユーザーの管理画面・管理用RPC の拒否 / 通知の削除。
// 使い方: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e-live/v8-check.mjs
// テスト用アカウントを2つ作り、作った募集は最後に取り消す。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE ?? 'https://compass-match.vercel.app';
const SUPA = 'https://jjhnmqeukfrknujtkash.supabase.co';
const KEY = 'sb_publishable_DNZxhx8TggQHujiY68tClQ_QSmtOGWt';
let failed = false;
async function step(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed = true; console.log(`FAIL  ${name}: ${String(e?.message ?? e).split('\n')[0]}`); throw e; }
}
async function ctx(browser) {
  const c = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await c.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && console.log('   console:', m.text().slice(0, 200)));
  return { c, page };
}
async function createRecruitment(p, name) {
  await p.goto(`${BASE}/recruitments/new`, { waitUntil: 'networkidle' });
  await p.locator('label', { hasText: 'フリーバトル' }).first().click();
  await p.locator('label', { hasText: '楽しく遊びたい' }).click();
  await p.getByRole('radio', { name: '今すぐ' }).click();
  await p.locator('label', { hasText: 'あと1人' }).click();
  await p.locator('label', { hasText: '早い者勝ち' }).click();
  const btns = p.getByRole('button', { name: /^募集する/ });
  await btns.first().click();
  if (name) {
    const sheet = p.getByRole('dialog');
    await sheet.waitFor({ timeout: 15_000 });
    await sheet.locator('#sheet-name').fill(name);
    await sheet.locator('input[type="checkbox"]').last().check();
    await sheet.getByRole('button', { name: /^はじめる/ }).click();
  }
  const rank = p.getByRole('dialog', { name: '現在のランクを選んでください' });
  if (name) {
    await rank.waitFor({ timeout: 30_000 });
    await rank.getByRole('radio', { name: 'S1以上' }).click();
    await rank.getByRole('button', { name: '決定して続ける' }).click();
  }
  await p.waitForURL(/\/recruitments\/[0-9a-f-]{36}/, { timeout: 30_000 }).catch(async (e) => {
    await p.screenshot({ path: '/tmp/claude-0/v8-stuck.png', fullPage: true });
    console.log('   text:', (await p.locator('[role=alert]').allInnerTexts()).join(' / '));
    throw e;
  });
  return p.url().split('?')[0];
}
async function token(c) {
  const ck = (await c.cookies()).filter((x) => x.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name));
  let raw = ck.map((x) => decodeURIComponent(x.value)).join('');
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString();
  return JSON.parse(raw).access_token;
}

const browser = await chromium.launch();
const X = await ctx(browser);
const Y = await ctx(browser);
const urls = [];
try {
  let xUrl;
  await step('X が募集を出す (ランクはこのとき聞かれる)', async () => { xUrl = await createRecruitment(X.page, '確認X'); urls.push([X, xUrl]); });
  await step('Y が参加する', async () => {
    const p = Y.page;
    await p.goto(xUrl, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /空いている席から/ }).click();
    const sheet = p.getByRole('dialog');
    await sheet.waitFor({ timeout: 15_000 });
    await sheet.locator('#sheet-name').fill('確認Y');
    await sheet.locator('input[type="checkbox"]').last().check();
    await sheet.getByRole('button', { name: /^はじめる/ }).click();
    const rank = p.getByRole('dialog', { name: '現在のランクを選んでください' });
    await rank.waitFor({ timeout: 30_000 });
    await rank.getByRole('radio', { name: 'A以下' }).click();
    await rank.getByRole('button', { name: '決定して続ける' }).click();
    await p.waitForURL(/joined=1/, { timeout: 30_000 });
  });
  await step('Y が自分の募集を出す → X に「確認Yさんが募集を出しました」', async () => {
    const yUrl = await createRecruitment(Y.page, null);
    urls.push([Y, yUrl]);
    const p = X.page;
    for (let i = 0; i < 6; i++) {
      await p.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
      if (await p.getByText('確認Yさんが募集を出しました').count()) return;
      await p.waitForTimeout(3000);
    }
    throw new Error('follow notification not found');
  });
  await step('X が通知をすべて削除できる', async () => {
    const p = X.page;
    await p.getByRole('button', { name: 'すべて削除' }).click();
    await p.getByText('通知はありません').waitFor({ timeout: 15_000 });
  });
  await step('一般ユーザーが /admin を開いても中身は出ない', async () => {
    // loading.tsx があるため応答は 200 のまま流れ、中身が「見つかりません」に置き換わる
    await Y.page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await Y.page.getByText('ページが見つかりません').first().waitFor({ timeout: 10_000 });
    if (await Y.page.getByRole('heading', { name: '管理画面' }).count()) throw new Error('admin heading visible');
    for (const tab of ['reports', 'users', 'usage', 'feedback']) {
      const html = await (await Y.page.request.get(`${BASE}/admin?tab=${tab}`)).text();
      if (html.includes('未処理の通報') || html.includes('大きい表') || html.includes('表示名 または ユーザーID')) throw new Error(`admin content leaked on ${tab}`);
    }
  });
  await step('一般ユーザーが管理用RPCを直接呼ぶと拒否される', async () => {
    const t = await token(Y.c);
    for (const [fn, body] of [['admin_usage', {}], ['admin_delete_feedback', { p_ids: null }], ['admin_delete_inactive_users', {}], ['admin_run_cleanup', {}]]) {
      const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const txt = await r.text();
      if (r.ok) throw new Error(`${fn} was allowed: ${txt}`);
      console.log(`   ${fn}: ${r.status} ${txt.slice(0, 90)}`);
    }
  });
} catch {
  /* 下で片付ける */
} finally {
  for (const [who, url] of urls.reverse()) {
    try {
      await who.page.goto(url, { waitUntil: 'networkidle' });
      const b = who.page.getByRole('button', { name: '募集を取り消す' });
      if (await b.count()) { await b.click(); await who.page.getByText('取り消し').first().waitFor({ timeout: 15_000 }); }
      console.log(`片付け: ${url} を取り消し`);
    } catch (e) { console.log(`片付け失敗: ${url} ${e.message.split('\n')[0]}`); }
  }
  await browser.close();
  console.log(failed ? 'FAILED' : 'ALL OK');
}
