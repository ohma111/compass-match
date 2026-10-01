// npm run build の後に自動で実行される (package.json の postbuild)。
// 開発用のフィクスチャプレビュー (/dev/preview) が本番ビルドに含まれていたら失敗させる。
import { existsSync, readFileSync } from 'node:fs';

const manifests = ['.next/app-path-routes-manifest.json', '.next/server/app-paths-manifest.json'];
let checked = 0;
for (const m of manifests) {
  if (!existsSync(m)) continue;
  checked++;
  const routes = Object.keys(JSON.parse(readFileSync(m, 'utf8')));
  const bad = routes.filter((r) => r.startsWith('/dev'));
  if (bad.length) {
    console.error(`開発用プレビューが本番ビルドに含まれています: ${bad.join(', ')} (${m})`);
    process.exit(1);
  }
}
if (existsSync('.next/server/app/dev')) {
  console.error('開発用プレビューが本番ビルドに含まれています: .next/server/app/dev');
  process.exit(1);
}
if (checked === 0) {
  console.error('ビルド結果 (.next) が見つかりません');
  process.exit(1);
}
console.log('check-no-preview: 開発用プレビューは本番ビルドに含まれていません');
