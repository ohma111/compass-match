// 開発用プレビュー (/dev/preview/*) を Playwright で撮影する。
// 使い方: (別ターミナルで) npm run dev → npm run preview:shots
//   BASE=http://localhost:3000 OUT=docs/screenshots node scripts/screenshots.mjs [screen ...]
// Playwright 本体はこのリポジトリの依存に入れていない (グローバルの playwright を使う)。
// ブラウザは PLAYWRIGHT_BROWSERS_PATH (例: /opt/pw-browsers) の Chromium を使う。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

const { chromium } = loadPlaywright();
const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? 'docs/screenshots';
const ALL = ['cover', 'home', 'home-empty', 'sheet', 'new', 'detail', 'detail-joined', 'me', 'transfer-code', 'transfer', 'me-guest'];
const screens = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const viewports = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  for (const s of screens) {
    await page.goto(`${BASE}/dev/preview/${s}`, { waitUntil: 'networkidle', timeout: 180_000 });
    // CSS の読み込みが終わる前に撮らない (開発サーバーのコンパイル直後に起きる)
    await page.waitForFunction(() => {
      const h = document.querySelector('header');
      return h && getComputedStyle(h).backgroundColor !== 'rgba(0, 0, 0, 0)';
    }, null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1300); // 参加確定の演出が終わるまで
    // 横スクロールが出ていないかを記録する (375px で崩れないこと)
    const overflow = await page.evaluate(() => {
      const page = document.documentElement.scrollWidth - window.innerWidth;
      // 横スクロールの入れ物 (絞り込みチップ) の中身以外で、画面の右端からはみ出している要素
      const clipped = [...document.querySelectorAll('main *')].filter((el) => {
        if (el.closest('.overflow-x-auto, .overflow-hidden')) return false;
        return el.getBoundingClientRect().right > window.innerWidth + 1;
      }).length;
      return Math.max(page, clipped);
    });
    const file = path.join(OUT, `${s}-${vp.name}.png`);
    if (vp.mobile) await page.screenshot({ path: path.join(OUT, `${s}-${vp.name}-fold.png`) });
    // 全体の画像では、固定のヘッダー・タブバー・募集ボタンの帯がページの途中に写り込んで内容を隠すため、
    // その撮影の間だけ通常の配置に戻す (最初に見える範囲の画像 *-fold.png は実際の見え方のまま)
    // シートを開いた画面は、固定の表示そのものが主役なので見えている範囲だけ撮る
    const sheetShot = s === 'sheet';
    const unfix = vp.mobile && !sheetShot
      ? await page.addStyleTag({
          content: 'header,nav[aria-label="メインメニュー"],.fixed{position:static!important}',
        })
      : null;
    await page.screenshot({ path: file, fullPage: !sheetShot });
    if (unfix) await unfix.evaluate((el) => el.remove());
    // 最初に見える範囲 (固定ヘッダー・タブバーの重なりを正しく確認するため)
    console.log(`${file}${overflow > 0 ? `  ⚠ horizontal overflow (${overflow})` : ''}`);
  }
  await ctx.close();
}
await browser.close();
