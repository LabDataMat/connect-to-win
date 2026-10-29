# 部署到 GitHub Pages（网页版试玩）

本文只针对**浏览器版**（`dist/pages`）。微信小游戏包（`dist/wxgame`）不能部署到 GitHub Pages，它必须用微信开发者工具上传。

---

## 1. 项目类型：纯静态，无框架

| 检查项 | 结论 |
| --- | --- |
| 框架 | ❌ 不是 Vite / Vue / React / Cocos Creator |
| 语言 | TypeScript（源码），esbuild 打包成一个 IIFE 文件 |
| 运行时依赖 | **0 个**（`package.json` 里只有 `typescript`、`esbuild` 两个开发依赖） |
| 构建产物 | `dist/web/index.html`（1.3 KB）+ `dist/web/game.js`（107 KB） |
| 外部资源 | **没有任何图片、音频、字体、CDN 请求**（图形全部 Canvas 代码绘制，音效 WebAudio 合成） |
| 后端 / 接口 | **无**，不联网、无 fetch、无 WebSocket |
| 环境变量 / 密钥 | **无**，`src/config.ts` 里只有广告位 ID（当前为空）和版本号 |
| 微信 API | 只在 `dist/wxgame` 里；`dist/web/game.js` 中 `wx.` 出现次数为 **0** |

结论：**可以部署到 GitHub Pages**，属于纯静态站点，不需要 Node 运行环境。

---

## 2. 入口文件与发布目录

| 项 | 路径 |
| --- | --- |
| HTML 模板（源） | `web/index.html` |
| 实际入口（构建后） | `dist/web/index.html` |
| **应上传的目录** | **`dist/pages`**（由 `npm run pack:pages` 生成，只含 `index.html`、`game.js`、`.nojekyll`） |

`dist/web` 里还有一个 `qa.html`（调试页，可跳关、自动求解），**不要发布**；`pack:pages` 已经把它排除掉了。

---

## 3. 构建命令

```bash
npm install          # 只装 typescript + esbuild
npm run pack:pages   # = npm run build + 复制纯净产物到 dist/pages
```

执行结果（本机实测）：

```
构建完成：
  dist/web/index.html + game.js  106.0 KB
  dist/wxgame/game.js            106.5 KB
  dist/wxgame 合计               107.8 KB（微信小游戏主包上限 4 MB）
  ✓ 体积检查通过
已生成 dist/pages（106.0 KB）
  index.html
  game.js
  .nojekyll
```

---

## 4. 路径检查（GitHub Pages 子路径）

GitHub Pages 的项目页地址是 `https://<用户名>.github.io/<仓库名>/`，站点不在域名根目录，绝对路径 `/game.js` 会 404。本项目：

- `index.html` 只用**相对路径** `<script src="./game.js">`，CSS 全部内联；
- `game.js` 是单个 IIFE，没有 `import()`、没有 `fetch`、没有 `new URL()` 之类的运行时路径；
- 没有任何图片/音频引用。

**实测验证**：用本地服务器把 `dist/pages` 挂在 `/connect-to-win/` 子路径下（模拟项目页），

```
GET /connect-to-win/           → 200
GET /connect-to-win/game.js    → 200
```

首页完整渲染（截图 `docs/screenshots/pages-subpath.png`），说明子路径部署无问题。

> 部署后如果白屏，99% 是 Pages 的 Source 选错了目录（选到了仓库根，而根目录没有 `index.html`）。

---

## 5. 依赖检查

- 无本地后端、无数据库、无接口；
- 无私有环境变量（构建时没有任何 `process.env` 注入）；
- 无第三方统计 SDK；
- 存档用浏览器 `localStorage`（`file://` 下不可用，`https://` 正常）；
- 分享按钮在网页版只打印一行日志，不会调起任何平台能力。

---

## 6. 不要上传的内容

| 不要上传 | 原因 |
| --- | --- |
| `node_modules/` | 开发依赖，几百 MB，Pages 用不到 |
| `build/`、`tmp/` | 中间产物 |
| `.workbuddy-ai/` | 本地助手缓存与笔记 |
| `dist/wxgame/` | 微信小游戏包，Pages 上跑不了 |
| `dist/web/qa.html` | 调试入口（跳关/自动求解），会泄露"作弊"页 |
| 任何 AppID / AppSecret / 广告位 ID | 本项目不含密钥；后续填写时也不要提交到公开仓库 |

`dist/pages` 只有 3 个文件（约 106 KB），是最小发布集。

---

## 7. 具体部署步骤

### 方式 A：gh-pages 分支（推荐，不污染源码目录）

```bash
# 1. 构建
npm run pack:pages

# 2. 提交产物（dist/pages 需要进入 git 历史）
git add dist/pages
git commit -m "build: pages"

# 3. 把 dist/pages 推到 gh-pages 分支（该分支根目录就是站点根）
git subtree push --prefix dist/pages origin gh-pages
```

然后在仓库 **Settings → Pages**：

- **Source**：`Deploy from a branch`
- **Branch**：`gh-pages`，目录选 **`/ (root)`**
- 保存后等待 1~2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

> 每次改完代码都要重新 `npm run pack:pages` → commit → `git subtree push`。

### 方式 B：main 分支的 `/docs`（更简单，但会把网页和文档混在一起）

```bash
npm run pack:pages
rm -rf docs-site && mkdir docs-site
cp dist/pages/* docs-site/
```

把 `docs-site` 改名为 `docs`（注意仓库里已有 `docs/` 放设计文档，需要先合并或改名），
Pages 的 Source 选 `main` 分支 / **`/docs`**。

---

## 8. 部署后需要在手机上验证的清单

打开 `https://<用户名>.github.io/<仓库名>/`：

- [ ] 首页完整显示：标题、开始游戏、每日挑战、选择关卡、设置、底部版本号
- [ ] 点「开始游戏」进入第 1 关，棋盘完整、不被地址栏遮挡
- [ ] **短按方块 → 顺时针转 90°**；**长按 ≥0.4 秒 → 逆时针转 90°**
- [ ] 连续点同一格 4 次，方块回到原朝向（没有错位/重影）
- [ ] 撤销按钮：转一步后变为可用，点一次步数 -1；用完 3 次后置灰
- [ ] 提示按钮：高亮整条最优路径，不扣步数
- [ ] 重试按钮：棋盘与步数完全重置，撤销次数恢复
- [ ] 暂停 → 继续；切到后台再回来会自动暂停
- [ ] 通关后出现三颗星、步数、最优步数、下一关
- [ ] 每日挑战：当天进入的谜题每次刷新都一样
- [ ] **刷新页面后进度仍在**（localStorage）；无痕模式下也能玩（只是不保存）
- [ ] 手机上滑动页面不会带动页面滚动（`touch-action: none` 生效）
- [ ] 横竖屏切换或地址栏收起后，画面自适应、按钮不被裁切
- [ ] 首次点击后能听到音效（iOS 需要用户交互才允许播放音频）
- [ ] 设置里「音效」开关能真正静音
- [ ] 分享按钮不会报错（网页版只打印日志）

### 已知限制（网页版）

- 没有微信分享卡片、没有广告、没有微信登录；
- iOS 低电量模式下 WebAudio 可能无声（系统限制）；
- 部分国产浏览器（如某些内置浏览器）对 `pointerup` 支持不完整，长按可能失效 —— 代码在缺少抬起事件时会退化为「按下即顺时针」，仍可玩。
