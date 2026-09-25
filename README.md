# 中国象棋

一个中国象棋桌面项目，基于 Tauri 2 打包。浏览器直接打开 `index.html` 时会使用内置 JavaScript 电脑方；通过 Tauri 启动时，会接入 Pikafish 象棋引擎（自动兼容 UCI/UCCI 协议），并把安装包发布到 GitHub Release。

## 主要特性

- 完整中国象棋规则与胜负判定
- 人机对弈，玩家为红方，电脑为黑方
- 接入 Pikafish 引擎，五档难度（新手、业余、进阶、高手、大师）
- 引擎缺失时自动回退到内置电脑方
- 棋局自动保存与重开，胜负弹窗、战绩统计
- 电脑走棋轨迹显示（起点、终点、箭头）
- 棋局用时统计（第一步落子开始计时）
- 音效与语音提示（MP3 优先，WAV 回退）
- 四套视觉主题：经典木纹、青瓷玉盘、宣纸墨韵、玄黑夜战
- 跨平台：macOS（`.app` / `.dmg`）与 Windows（`.msi` / NSIS `.exe`）

## 仓库结构

- `index.html` / `styles.css` / `game.js`：前端界面、象棋规则、AI 调用、计时与设置
- `src-tauri/`：Tauri 2 + Rust 后端；桌面端负责启动 Pikafish，iOS 端负责调用内置原生引擎
- `src-tauri/native/`：iOS 使用的 Pikafish C++ 源码、静态库构建脚本与 C ABI 桥接
- `tauri-web/`：Tauri 实际打包用的前端静态目录，由 `npm run tauri:sync` 从根目录同步生成
- `engines/`：引擎文件（`pikafish`、`pikafish.exe`、`pikafish.nnue`）
- `assets/voice/`：提示语音（MP3 优先，缺失时回退 WAV）
- `legal/`：第三方声明与许可证
- `scripts/`：本地打包、上传、签名等辅助脚本
- `.github/workflows/release.yml`：打 tag 触发的 CI 自动发布流程

## 本地开发

依赖：Node.js LTS、Rust（`rustup` 工具链）、macOS 需 Xcode Command Line Tools，Windows 需 MSVC Build Tools 与 WebView2。

```bash
npm install
npm run tauri:dev
```

修改 `index.html` / `styles.css` / `game.js` 后，运行同步命令再启动打包：

```bash
npm run tauri:sync
```

### iOS 第一版

iOS 不启动外部可执行文件，而是把 Pikafish C++ 源码和 `engines/pikafish.nnue` 一起编入 App；桌面端原有的 UCI/UCCI 进程方案保持不变。

在 macOS 上准备 Xcode、Rust iOS target 和 XcodeGen 后，可生成并构建 iOS 工程：

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npx tauri ios init --ci --skip-targets-install
npx tauri ios build --debug --target aarch64-sim --no-sign --ci
```

真机发布需要 Apple Developer 签名与 provisioning profile；`--no-sign` 仅用于模拟器或本地静态构建检查。

Xcode 27 兼容性：`src-tauri/Cargo.lock` 固定使用包含 Xcode 27 修复的 `swift-rs 1.0.8`。如果重新生成锁文件，请执行 `cargo update --manifest-path src-tauri/Cargo.toml -p swift-rs --precise 1.0.8`，不要回退到 1.0.7。

## 本地打包

```bash
# macOS / Windows 通用
npm run tauri:build
```

产物位置：

- macOS：`src-tauri/target/release/bundle/{macos,dmg}/`
- Windows：`src-tauri/target/release/bundle/{msi,nsis,portable}/`

macOS 免费发布候选包（仅产出 `.app`）：

```bash
npm run build:mac:store
```

Mac App Store 上传包使用商店分发签名，本机直接安装后可能无法打开。本机安装测试请使用 local test 包：

```bash
bash scripts/package-mac-local-test.sh
```

## 接入 UCCI / UCI 引擎

把兼容引擎放入 `engines/` 目录，推荐命名：

- Windows: `engines/pikafish.exe`
- macOS / Linux: `engines/pikafish`

也可以用环境变量指定任意位置：

```bash
CHESS_ENGINE_PATH=/absolute/path/to/pikafish npm run tauri:dev
```

后端通过 UCCI/UCCI-over-UCI 协议请求最佳走法并返回 `bestmove`；没有引擎时自动回退到内置电脑方。

## 发布到 GitHub Release

本项目通过 GitHub Actions 在打 `v*` tag 时自动构建 Windows + macOS 安装包并发布到同名 Release。详细步骤见 [`RELEASE.md`](./RELEASE.md)。摘要：

### 方式一：自动 CI（推荐）

```bash
git add .
git commit -m "chore: release v0.2.x"
git push
git tag v0.2.x
git push origin v0.2.x
```

推送 tag 后到 **Actions** 页面查看 `Release Build` 工作流，完成后 **Releases** 页面会同时拥有 Windows 与 macOS 产物：

- Windows：`.msi`、NSIS `.exe`、便携版 `portable.exe`
- macOS：`.dmg`、便携版 `*.app.zip`

### 方式二：手动上传

在 Windows / macOS 机器上分别：

```bash
npm install
npm run tauri:build
bash scripts/publish-release.sh v0.2.x   # 需 gh auth login
```

两个平台各跑一次，产物会累积到同一个 Release。

## 第三方声明与许可

`engines/pikafish` 与 `engines/pikafish.exe` 按 GPLv3 分发；`engines/pikafish.nnue` 有单独的 NNUE 许可声明；完整声明见 `legal/Pikafish-GPLv3.txt`、`legal/Pikafish-NNUE-License.md` 与 `THIRD_PARTY_NOTICES.md`。**免费发布时请保持无广告、无内购、无付费解锁，并随包保留以上第三方声明。**

iOS 静态集成使用 `src-tauri/native/pikafish-source/` 中固定版本的 Pikafish C++ 源码，并随源码保留 `Copying.txt`。商业化或 App Store 付费发布前，需要先取得 Pikafish 上游的商业授权，并按 GPLv3 与 NNUE 许可要求完成随包声明。

## macOS 免费发布额外说明

打包资源目前只携带：

- `engines/pikafish`
- `engines/pikafish.exe`
- `engines/pikafish.nnue`
- `legal/Pikafish-GPLv3.txt`
- `legal/Pikafish-NNUE-License.md`
- `THIRD_PARTY_NOTICES.md`

macOS 包不会再携带原始下载归档目录 `Pikafish.2026-01-02/`。上 Mac App Store 前还需要完成：

- 把 `src-tauri/tauri.conf.json` 的 `identifier` 改成 Apple Developer 账号下注册的正式 Bundle ID
- 使用 Mac App Distribution 证书与 provisioning profile 签名
- 确认 `engines/pikafish` 也被同一发布身份正确签名
- 在沙盒环境下测试引擎启动、读取 `pikafish.nnue`、完成 AI 走棋
- 在 App Store Connect 准备截图、描述、隐私政策 URL、年龄分级与支持网址
