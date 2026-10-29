/**
 * 构建脚本：同时产出 Web 预览版与微信小游戏版。
 * 运行：npm run build
 */
import esbuild from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const common = {
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  charset: 'utf8',
};

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fileSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

// ---------- Web 预览版 ----------
mkdirSync(join(root, 'dist/web'), { recursive: true });
await esbuild.build({ ...common, entryPoints: [join(root, 'src/entry.web.ts')], outfile: join(root, 'dist/web/game.js') });
writeFileSync(join(root, 'dist/web/index.html'), readFileSync(join(root, 'web/index.html'), 'utf8'), 'utf8');
// QA 预览页（仅 Web 预览使用，不进入微信包）
writeFileSync(join(root, 'dist/web/qa.html'), readFileSync(join(root, 'web/qa.html'), 'utf8'), 'utf8');

// ---------- 微信小游戏版 ----------
const wxOut = join(root, 'dist/wxgame');
mkdirSync(wxOut, { recursive: true });
await esbuild.build({ ...common, entryPoints: [join(root, 'src/entry.wx.ts')], outfile: join(wxOut, 'game.js') });

const gameJson = {
  deviceOrientation: 'portrait',
  showStatusBar: false,
  networkTimeout: { request: 5000, connectSocket: 5000, uploadFile: 5000, downloadFile: 5000 },
};
writeFileSync(join(wxOut, 'game.json'), JSON.stringify(gameJson, null, 2), 'utf8');

const projectConfig = {
  description: '接通就赢 - 2D 电路旋转解谜小游戏',
  packOptions: { ignore: [], include: [] },
  setting: {
    urlCheck: false,
    es6: true,
    enhance: true,
    postcss: false,
    minified: true,
    newFeature: false,
    autoAudits: false,
    uploadWithSourceMap: false,
    uglifyFileName: false,
  },
  compileType: 'game',
  libVersion: '3.5.0',
  appid: 'touristappid',
  projectname: 'connect-to-win',
  simulatorType: 'game',
  condition: {},
};
writeFileSync(join(wxOut, 'project.config.json'), JSON.stringify(projectConfig, null, 2), 'utf8');

writeFileSync(
  join(wxOut, 'README.md'),
  [
    '# 微信小游戏构建产物',
    '',
    `版本：${pkg.version}`,
    '',
    '## 导入方式',
    '1. 打开微信开发者工具 → 导入项目，目录选择本文件夹。',
    '2. AppID 处填写自己的小游戏 AppID（当前 project.config.json 中为 touristappid，仅用于游客模式预览）。',
    '3. 项目类型为“小游戏”，编译后即可在模拟器中运行。',
    '',
    '## 注意',
    '- 本目录由 `npm run build` 生成，请勿手工修改。',
    '- 未配置真实广告位 ID 时，广告层处于开发模式，不会展示任何广告。',
    '- 正式提审前必须替换 AppID 并完成备案、类目与资质要求（见 docs/publish-checklist.md）。',
    '',
  ].join('\n'),
  'utf8'
);

// ---------- 体积报告 ----------
const webSize = fileSize(join(root, 'dist/web/game.js')) + fileSize(join(root, 'dist/web/index.html'));
const wxMain = fileSize(join(wxOut, 'game.js'));
const wxTotal =
  wxMain +
  fileSize(join(wxOut, 'game.json')) +
  fileSize(join(wxOut, 'project.config.json')) +
  fileSize(join(wxOut, 'README.md'));

console.log('\n构建完成：');
console.log(`  dist/web/index.html + game.js  ${kb(webSize)}`);
console.log(`  dist/wxgame/game.js            ${kb(wxMain)}`);
console.log(`  dist/wxgame 合计               ${kb(wxTotal)}（微信小游戏主包上限 4 MB）`);
if (wxTotal > 4 * 1024 * 1024) {
  console.error('  ✗ 超出微信小游戏主包体积限制');
  process.exit(1);
}
console.log('  ✓ 体积检查通过');
