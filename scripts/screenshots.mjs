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
const ALL = ['home', 'home-empty', 'new', 'detail', 'detail-joined', 'signup', 'signup-done', 'login', 'me'];
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
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1300); // 参加確定の演出が終わるまで
    // 横スクロールが出ていないかを記録する (375px で崩れないこと)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = path.join(OUT, `${s}-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    // 最初に見える範囲 (固定ヘッダー・タブバーの重なりを正しく確認するため)
    if (vp.mobile) await page.screenshot({ path: path.join(OUT, `${s}-${vp.name}-fold.png`) });
    console.log(`${file}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ''}`);
  }
  await ctx.close();
}
await browser.close();
