/**
 * 生成可直接上传到 GitHub Pages 的纯净目录：dist/pages
 * 只包含 index.html、game.js 和 .nojekyll，不含 QA 调试页与微信包。
 * 运行：npm run pack:pages
 */
import { mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'dist/web');
const out = join(root, 'dist/pages');

mkdirSync(out, { recursive: true });

for (const f of ['index.html', 'game.js']) {
  copyFileSync(join(src, f), join(out, f));
}
// GitHub Pages 默认走 Jekyll，加 .nojekyll 跳过处理，避免下划线开头的文件被忽略
writeFileSync(join(out, '.nojekyll'), '', 'utf8');

const size = ['index.html', 'game.js'].reduce((sum, f) => sum + statSync(join(out, f)).size, 0);
console.log(`已生成 dist/pages（${(size / 1024).toFixed(1)} KB）`);
console.log('  index.html');
console.log('  game.js');
console.log('  .nojekyll');
