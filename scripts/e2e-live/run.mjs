// 本番サイトでの通しテスト (運営者の許可のもとで実行する。テスト用アカウントを作る)。
// 使い方: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e-live/run.mjs
//   BASE=https://compass-match.vercel.app (既定) / OUT=docs/e2e-live (スクリーンショット)
// 自分で作った募集だけを操作し、最後に B の参加取り消しと A の募集取り消しで片付ける。アカウントは消さない。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium, devices } = pw;

const BASE = process.env.BASE ?? 'https://compass-match.vercel.app';
const OUT = process.env.OUT ?? 'docs/e2e-live';
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleErrors = [];
const actionLog = [];
const friction = [];
let shot = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ step: name, ok: true, ms: Date.now() - t0 });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ step: name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).split('\n')[0] });
    console.log(`FAIL  ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
    throw e;
  }
}

async function snap(page, label) {
  shot += 1;
  const file = path.join(OUT, `${String(shot).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
}

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${who}] console: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${who}] pageerror: ${String(e).slice(0, 300)}`));
  page.on('response', (r) => {
    if (r.status() >= 500) consoleErrors.push(`[${who}] HTTP ${r.status()} ${r.url().slice(0, 200)}`);
  });
  page.on('dialog', (d) => d.accept());
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) actionLog.push(`[${who}] action POST ${new URL(r.url()).pathname}`);
  });
}

/** チャット欄の吹き出し (入力欄の文字に誤って一致しないよう、吹き出しだけを探す) */
function bubble(page, text) {
  return page.locator('section[aria-labelledby="chat-title"] [aria-live="polite"] p').filter({ hasText: text });
}

async function newContext(browser, who) {
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 375, height: 812 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  ctx.on('page', (p) => watch(p, who));
  const page = await ctx.newPage();
  return { ctx, page };
}

async function fillSheet(page, name) {
  const sheet = page.getByRole('dialog');
  await sheet.waitFor({ timeout: 15_000 });
  await snap(page, `sheet-${name}`);
  await sheet.locator('#sheet-name').fill(name);
  await sheet.locator('label', { hasText: 'S5–7' }).click();
  await sheet.locator('input[type="checkbox"]').last().check();
  await sheet.getByRole('button', { name: /^はじめる/ }).click();
  await sheet.waitFor({ state: 'detached', timeout: 30_000 });
}

/** 期待するものが出るまで、ページを読み込み直しながら待つ (15秒ごとの自動更新・Realtime の代わり) */
async function eventually(page, locatorFn, { timeout = 40_000, reload = true } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      await locatorFn().first().waitFor({ timeout: 8_000 });
      return;
    } catch (e) {
      if (Date.now() > until) throw e;
      if (reload) await page.reload({ waitUntil: 'networkidle' });
    }
  }
}

const browser = await chromium.launch();
let recruitmentUrl = null;
let transferCode = null;
const A = await newContext(browser, 'A');
const B = await newContext(browser, 'B');
let failed = false;

try {
  await step('A: 募集する → シート → はじめる → 募集が続けて出る', async () => {
    const p = A.page;
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await snap(p, 'A-home');
    await p.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: /募集する/ }).click();
    await p.waitForURL('**/recruitments/new');
    await p.locator('label', { hasText: 'エンジョイ' }).first().click();
    await p.locator('label', { hasText: '今すぐ' }).click();
    await p.locator('label', { hasText: 'あと1人' }).click();
    await p.locator('label', { hasText: '早い者勝ち' }).click();
    await snap(p, 'A-new');
    await p.getByRole('button', { name: /^募集する/ }).first().click();
    await fillSheet(p, 'テストA');
    await p.waitForURL(/\/recruitments\/[0-9a-f-]{36}/, { timeout: 30_000 });
    recruitmentUrl = p.url().split('?')[0];
    await snap(p, 'A-created');
  });

  await step('A: 募集がホームに出る', async () => {
    const p = A.page;
    await p.goto(BASE, { waitUntil: 'networkidle' });
    const id = recruitmentUrl.split('/').pop();
    await p.locator(`a[href="/recruitments/${id}"]`).first().waitFor({ timeout: 15_000 });
    await snap(p, 'A-home-listed');
  });

  await step('B: ホーム → 空き席をタップ → シート → リロードなしで参加 → 満員', async () => {
    const p = B.page;
    await p.goto(BASE, { waitUntil: 'networkidle' });
    const id = recruitmentUrl.split('/').pop();
    await p.locator(`a[href="/recruitments/${id}"]`).first().click();
    await p.waitForURL(`**/recruitments/${id}`);
    await snap(p, 'B-detail');
    await p.getByRole('button', { name: /空いている席に入る/ }).click();
    // ページを読み込み直していないことの確認用の目印
    await p.evaluate(() => (window.__noReload = true));
    await fillSheet(p, 'テストB');
    await p.waitForURL(/joined=1/, { timeout: 30_000 });
    const still = await p.evaluate(() => window.__noReload === true);
    if (!still) throw new Error('page was reloaded during join');
    await p.getByText('満員').first().waitFor({ timeout: 15_000 });
    await p.getByRole('heading', { name: '部屋番号' }).waitFor({ timeout: 15_000 });
    await snap(p, 'B-joined');
  });

  await step('A: 部屋番号 12345 → B に表示とコピー', async () => {
    const a = A.page;
    await a.goto(recruitmentUrl, { waitUntil: 'networkidle' });
    const input = a.locator('input[aria-label="部屋番号"]').locator('visible=true');
    await input.first().fill('12345');
    await a.getByRole('button', { name: '保存' }).locator('visible=true').first().click();
    await a.getByText('12345').first().waitFor({ timeout: 15_000 });
    await snap(a, 'A-roomcode');
    const b = B.page;
    await eventually(b, () => b.getByText('12345', { exact: true }).locator('visible=true'));
    await b.getByRole('button', { name: /コピー/ }).locator('visible=true').first().waitFor();
    await snap(b, 'B-roomcode');
  });

  await step('A・B がチャットを1件ずつ → 両方に両方が見える', async () => {
    const send = async (p, text) => {
      await p.getByLabel('メッセージ').fill(text);
      await p.getByRole('button', { name: '送信' }).click();
      // 自分の発言がすぐ出るか (v4.1 以前は Realtime 頼み)。出なければ読み込み直して保存されたか確かめる
      const immediate = await bubble(p, text).first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
      if (!immediate) {
        friction.push(`own chat message "${text}" did not appear until reload`);
        await eventually(p, () => bubble(p, text));
      }
    };
    await send(A.page, 'テストAです よろしく');
    await send(B.page, 'テストBです よろしく');
    await eventually(A.page, () => bubble(A.page, 'テストBです よろしく'));
    await eventually(B.page, () => bubble(B.page, 'テストAです よろしく'));
    await snap(A.page, 'A-chat');
    await snap(B.page, 'B-chat');
  });

  await step('A: 同じコンテキストの新しいタブでもログインしたまま (シートなし)', async () => {
    const p2 = await A.ctx.newPage();
    await p2.goto(recruitmentUrl, { waitUntil: 'networkidle' });
    await p2.getByText('12345').locator('visible=true').first().waitFor({ timeout: 15_000 });
    if (await p2.getByRole('dialog').count()) throw new Error('sheet shown on reload');
    await snap(p2, 'A-newtab');
    await p2.close();
  });

  await step('B: 作成10分以内の匿名アカウントは11件目で止まる', async () => {
    const p = B.page;
    // 1件送信済み。一般の制限 (2秒に1件・30秒に5件) に当たらないよう 6.5秒あける
    let sent = 1;
    let limitError = null;
    while (sent < 11) {
      await p.waitForTimeout(6_500);
      const text = `上限テスト ${sent + 1}`;
      await p.getByLabel('メッセージ').fill(text);
      await p.getByRole('button', { name: '送信' }).click();
      // 送信の結果: エラー表示が出たか、読み込み直して吹き出しが増えたか
      await p.waitForTimeout(2_500);
      const alertText = (await p.locator('section[aria-labelledby="chat-title"] [role="alert"]').allInnerTexts()).join(' ').trim();
      let ok = false;
      if (!alertText) {
        ok = await bubble(p, text).first().waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
        if (!ok) {
          await p.reload({ waitUntil: 'networkidle' });
          ok = await bubble(p, text).first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
        }
      }
      if (!ok) {
        limitError = await p.locator('section[aria-labelledby="chat-title"] [role="alert"]').allInnerTexts();
        const state = await p.evaluate(() => ({
          value: document.querySelector('textarea[aria-label="メッセージ"]')?.value,
          disabled: document.querySelector('button[aria-label="送信"]')?.disabled,
        }));
        console.log('chat-limit stop', sent, JSON.stringify(limitError), JSON.stringify(state));
        break;
      }
      sent += 1;
    }
    await snap(p, 'B-chat-limit');
    if (sent !== 10) throw new Error(`stopped after ${sent} messages; alert=${JSON.stringify(limitError)}`);
    if (!limitError?.join(' ').includes('10件まで')) throw new Error(`unexpected error: ${JSON.stringify(limitError)}`);
  });

  await step('A: マイページで引き継ぎコードを作る', async () => {
    const p = A.page;
    await p.goto(`${BASE}/me`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: '引き継ぎコードを作る' }).click();
    const code = p.locator('[aria-label^="引き継ぎコード "]');
    await code.first().waitFor({ timeout: 20_000 });
    transferCode = (await code.first().locator('span').allInnerTexts()).join('-');
    if (transferCode.replace(/-/g, '').length !== 20) throw new Error(`bad code ${transferCode}`);
    await snap(p, 'A-transfer-code');
  });

  await step('C: 引き継ぐ → テストAとしてログイン', async () => {
    const C = await newContext(browser, 'C');
    const p = C.page;
    await p.goto(`${BASE}/transfer`, { waitUntil: 'networkidle' });
    await p.getByLabel('引き継ぎコード').fill(transferCode);
    await snap(p, 'C-transfer');
    await p.getByRole('button', { name: /^引き継ぐ/ }).click();
    await p.waitForURL('**/me', { timeout: 30_000 });
    await p.getByRole('heading', { name: 'テストA' }).waitFor({ timeout: 15_000 });
    await snap(p, 'C-me');
    await C.ctx.close();
  });
} catch {
  failed = true;
} finally {
  // 片付け: B は参加をやめ、A は募集を取り消す (アカウントは消さない)
  if (recruitmentUrl) {
    try {
      await step('片付け: B が参加をやめる', async () => {
        const p = B.page;
        await p.goto(recruitmentUrl, { waitUntil: 'networkidle' });
        const btn = p.getByRole('button', { name: '参加をやめる' });
        if (await btn.count()) {
          await btn.click();
          await p.getByRole('button', { name: /参加する/ }).first().waitFor({ timeout: 15_000 });
        }
        await snap(p, 'cleanup-B-left');
      });
    } catch {
      failed = true;
    }
    try {
      await step('片付け: A が募集を取り消す → ホームに出ない', async () => {
        const p = A.page;
        await p.goto(recruitmentUrl, { waitUntil: 'networkidle' });
        await p.getByRole('button', { name: '募集を取り消す' }).click();
        await p.getByText('取り消し').first().waitFor({ timeout: 15_000 });
        await p.goto(BASE, { waitUntil: 'networkidle' });
        const id = recruitmentUrl.split('/').pop();
        if (await p.locator(`a[href="/recruitments/${id}"]`).count()) throw new Error('still listed on home');
        await snap(p, 'cleanup-A-cancelled');
      });
    } catch {
      failed = true;
    }
  }
  await browser.close();
  const report = { base: BASE, at: new Date().toISOString(), recruitment: recruitmentUrl, results, consoleErrors, actionLog, friction };
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ failed, consoleErrors }, null, 2));
  process.exitCode = failed ? 1 : 0;
}
