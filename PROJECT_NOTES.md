# 中国象棋项目记录

本文档用于在新的 Codex 对话中快速接上当前项目背景。项目路径：

```text
/Users/rwoody/Library/CloudStorage/OneDrive-MerckGroup/myProjects/chinese-chess
```

## 项目概况

这是一个中国象棋桌面游戏，当前主线版本是 Tauri 版。前端用原生 HTML/CSS/JavaScript，桌面壳和系统能力由 Tauri 2 + Rust 提供，电脑方使用 Pikafish 引擎。

主要文件：

- `index.html`：界面结构，棋盘、右侧控制区、弹窗。
- `styles.css`：棋盘、棋子、布局、主题风格和响应式样式。
- `game.js`：象棋规则、AI 调用、计时、战绩、音效、自动保存、主题切换。
- `src-tauri/src/main.rs`：Tauri/Rust 后端，负责查找并启动 Pikafish，通过 UCI/UCCI 协议获取 bestmove。
- `src-tauri/tauri.conf.json`：Tauri 构建、窗口、资源、图标配置。
- `tauri-web/`：Tauri 实际打包用的前端静态目录，由 `npm run tauri:sync` 从根目录同步。
- `engines/`：引擎文件，包含 `pikafish`、`pikafish.exe`、`pikafish.nnue`。
- `assets/voice/`：提示语音文件，优先播放 MP3，缺失时回退 WAV。

## 技术栈

- HTML / CSS / JavaScript：游戏界面和核心规则。
- Tauri 2：桌面应用框架。
- Rust：Tauri 后端，启动和通信 Pikafish。
- Pikafish：象棋 AI 引擎。
- UCI/UCCI：与引擎通信的协议。
- Node.js / npm：运行构建脚本和 Tauri CLI。
- Cargo / Rustup：编译 Tauri 后端。
- localStorage：保存棋局、战绩、设置、主题、计时。

## 常用命令

在项目根目录执行：

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

同步前端到 Tauri 打包目录：

```bash
npm run tauri:sync
```

Windows 版建议在 Windows 机器上构建：

```bat
npm install
npm run tauri:build:win
```

注意：`npm run build:win` 是旧 Electron 打包脚本，不是当前 Tauri 主线，不建议使用。

macOS 正式打包产物通常在：

```text
src-tauri/target/release/bundle/macos/
```

其中：

- `.app` 是应用本体。
- `.dmg` 是适合分发给别人的安装镜像。

## 当前主要功能

- 人机对弈，玩家为红方，电脑为黑方。
- Pikafish 引擎接入，支持 macOS 和 Windows 引擎文件。
- 五档难度：新手、业余、进阶、高手、大师。
- 可选择玩家先走或机器先走。
- 机器先走模式下，重开后不会自动走，必须再点一次“机器先走”开始新局，避免误触。
- 棋局总用时统计，从第一步真正落子开始计时，胜负确定后停止。
- 自动保存棋局、战绩、设置、主题和计时。
- 胜负弹窗：玩家胜利显示“恭喜，你胜利了！”，电脑胜利显示“你已失败”。
- 输赢次数统计，可重置，重置前有确认弹窗。
- 电脑走棋轨迹显示：起点、终点和箭头轨迹。
- 音效和语音开关在右上角设置区。
- 语音提示支持 MP3，文件名见 `assets/voice/README.md`。
- 四套视觉主题：经典木纹、青瓷玉盘、宣纸墨韵、玄黑夜战。
- 自定义应用图标已接入，图标文件在 `src-tauri/icons/`。

## 当前难度参数

在 `game.js` 的 `engineProfiles` 中：

```js
beginner: { depth: 1, moveTime: 220, multiPv: 3, candidateRank: 2 },
amateur: { depth: 2, moveTime: 800, multiPv: 3, candidateRank: 1 },
advanced: { depth: 3, moveTime: 1400 },
strong: { depth: 5, moveTime: 3600 },
master: { depth: 9, moveTime: 8000 },
```

含义：

- `depth`：搜索深度，越高越强。
- `moveTime`：单步思考时间，单位毫秒。
- `multiPv`：让 Pikafish 给出几个候选招。
- `candidateRank`：本项目后端选择第几个候选招。`1` 是最优招。

调参经验：

- 单纯选择次优招会让电脑显得很傻，不如优先调低 `depth`。
- 新手档当前保留 `candidateRank: 2`，用于明显降低难度。
- 业余档恢复为最优招，但 depth 较低。

## Pikafish 引擎说明

引擎文件位于 `engines/`：

- `pikafish`：macOS 用。
- `pikafish.exe`：Windows 用。
- `pikafish.nnue`：Pikafish 的神经网络评估文件，必须随包携带。

Tauri 配置会把 `../engines/*` 打进资源目录。Rust 后端会尝试从多个位置查找引擎和 NNUE 文件，包括开发目录和打包后的 resource 目录。

Windows 打包时确认 `pikafish.exe` 和 `pikafish.nnue` 存在。

## 主要变更历史和设计考虑

1. 最初是普通网页式中国象棋界面，后来加了人机对弈。
2. 内置 AI 水平太弱，于是接入 Pikafish。
3. Electron 版体积约 290MB，用户觉得不能接受，因此迁移到 Tauri。
4. Tauri 版体积明显下降，主要体积来自 `pikafish.nnue`。
5. 棋盘布局多次调整，最终采用左侧棋盘、右侧信息和控制面板。
6. 为避免窗口调小后棋盘显示不全，加入动态棋盘尺寸计算。
7. 加入音效、提示语音、胜负弹窗、战绩统计。
8. 语音从 WAV 改为优先 MP3，便于使用网上 TTS 工具生成语音文件。
9. 加入自动保存，避免 Tauri dev 或窗口刷新导致丢局。
10. 加入五档难度，并多次根据实际体验调整 Pikafish depth。
11. 加入先手选择；后来改成切换先手需要确认，机器先走重开后需要再次点击才开始。
12. 加入棋局用时统计，后来修正为第一步落子后才开始计时。
13. 加入多主题棋盘和棋子样式；青瓷主题曾出现大纹理干扰棋盘阅读，后来改为细腻低对比纹理。
14. 用用户提供的图标图生成了 Tauri 图标文件，并配置到 `tauri.conf.json`。

## 重要踩坑记录

### npm / Node.js

Windows 上如果提示不认识 `npm install`，通常是没有安装 Node.js，或没有加入 PATH。安装 Node.js LTS 后重新打开命令行，检查：

```bat
node -v
npm -v
```

### Rust / Cargo

Tauri 需要 Rust。Windows 上如果缺少 Cargo，可用：

```bat
winget install Rustlang.Rustup
```

然后重新打开命令行检查：

```bat
cargo -V
rustc -V
```

### Tauri 配置字段

曾经遇到 `tauri.conf.json` 中 macOS `category` 字段位置不对的问题。当前配置中 `bundle.category` 可用。

### Cargo manifest

曾遇到 `can't find library chinese_chess_lib`，原因是 Tauri/Rust 模板的 lib 配置与实际文件不匹配。当前后端入口在 `src-tauri/src/main.rs`。

### 图标缺失

曾因 `src-tauri/icons/icon.png` 缺失导致编译失败。当前 `src-tauri/icons/` 已生成完整图标文件：

- `icon.png`
- `icon.icns`
- `icon.ico`
- 多尺寸 PNG

### 引擎通信

曾出现：

- `spawn Unknown system error -8`
- `引擎未给出 bestmove（timeout）`
- `missing-engine`
- 缺少 `pikafish.nnue`

经验：

- 确认 `engines/pikafish` 或 `engines/pikafish.exe` 存在并可执行。
- 确认 `engines/pikafish.nnue` 存在。
- 打包后确认 `Contents/Resources/_up_/engines` 或 Windows 对应资源目录中包含引擎文件。

### Tauri dev 和刷新

`npm run tauri:dev` 是开发模式，可能因为文件变化或 WebView 行为导致窗口刷新。为避免丢局，已加入自动保存。

### 胜负弹窗重复

曾出现一盘结束后切回程序，胜利/失败提示重复刷新。原因是页面重新加载时只要发现 `state.winner` 就再次 `showResult()`。已加入 `resultShown`，同一盘胜负只自动弹一次。

### 初始化顺序导致棋盘消失

曾把 `createInitialState(startWithComputer = computerFirst)` 写成默认引用 `computerFirst`，但 `state = createInitialState()` 执行时 `computerFirst` 尚未初始化，导致运行时报错、棋盘消失。已改为：

```js
function createInitialState(startWithComputer = false, waitForComputerStart = false)
```

### 先手误触

先手切换会重开棋局，因此已加入确认弹窗。用户确认后才切换。机器先走模式下，重开后还需要再点一次“机器先走”才开始，避免误触。

### 计时逻辑

计时不应从打开程序或新开局开始，而应从第一步真正落子开始。当前 `startedAt` 初始为 `null`，第一次 `makeMove()` 时启动计时。关闭/刷新期间不计入棋局用时。

## 新对话接手建议

如果在新的 Codex 对话继续，请先读：

```bash
sed -n '1,220p' PROJECT_NOTES.md
sed -n '1,120p' package.json
sed -n '1,160p' src-tauri/tauri.conf.json
sed -n '1,120p' game.js
```

修改前端根目录文件后，一定运行：

```bash
npm run tauri:sync
```

常规检查：

```bash
node --check game.js
node --check tauri-web/game.js
cargo check
```

打包 macOS：

```bash
npm run tauri:build
```

Windows 打包建议在 Windows 上执行：

```bat
npm install
npm run tauri:build:win
```
