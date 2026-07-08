# 中国象棋

这是一个中国象棋桌面项目。浏览器直接打开 `index.html` 时会使用内置 JavaScript 电脑方；通过 Tauri 启动时，可以接入 Pikafish/UCI/UCCI 象棋引擎。

## Tauri 启动和打包

Tauri 需要先安装 Rust 工具链。

```bash
npm install
npm run tauri:dev
```

打包：

```bash
npm run tauri:build
```

macOS 免费发布候选包：

```bash
npm run build:mac:store
```

生成 Mac App Store 上传用 `.pkg`：

```bash
APP_SIGN_IDENTITY="Apple Distribution: Your Name (TEAMID)" \
INSTALLER_SIGN_IDENTITY="3rd Party Mac Developer Installer: Your Name (TEAMID)" \
PROFILE_PATH="$HOME/Downloads/PureChineseChess_Mac_App_Store.provisionprofile" \
bash scripts/package-mac-store.sh
```

Tauri 会使用 `tauri-web/` 作为前端发布目录。它由下面的命令从根目录的 `index.html`、`styles.css`、`game.js` 同步生成：

```bash
npm run tauri:sync
```

## 接入 UCCI 引擎

把 UCCI 兼容引擎放入 `engines/` 目录，推荐命名：

- Windows: `engines/pikafish.exe`
- macOS/Linux: `engines/pikafish`

也可以用环境变量指定绝对路径：

```bash
CHESS_ENGINE_PATH=/absolute/path/to/pikafish npm run tauri:dev
```

有引擎时，前端会发送当前局面的 FEN，主进程通过 UCCI 协议请求最佳走法，并把 `bestmove` 返回给棋盘执行。没有引擎时会自动退回内置电脑方。
Pikafish 通常使用 UCI 协议，项目会自动兼容 UCI/UCCI。

## 免费发布说明

macOS 打包资源目前只携带：

- `engines/pikafish`
- `engines/pikafish.nnue`
- `legal/Pikafish-GPLv3.txt`
- `legal/Pikafish-NNUE-License.md`
- `THIRD_PARTY_NOTICES.md`

也就是说，macOS 包不会再携带 Windows 的 `pikafish.exe`，也不会携带原始下载归档目录 `Pikafish.2026-01-02/`。Pikafish 程序本体按 GPLv3 分发，NNUE 权重文件有单独声明；免费发布时应保持无广告、无内购、无付费解锁，并随包保留第三方声明。

上 Mac App Store 前还需要完成这些账号和签名事项：

- 把 `src-tauri/tauri.conf.json` 里的 `identifier` 改成 Apple Developer 账号下注册的正式 Bundle ID。
- 使用 Mac App Distribution 证书和 provisioning profile 签名。
- 确认 `engines/pikafish` 也被同一发布身份正确签名。
- 在沙盒环境下测试引擎启动、读取 `pikafish.nnue`、完成 AI 走棋。
- 在 App Store Connect 准备截图、描述、隐私政策 URL、年龄分级和支持网址。

## Windows 打包

```bash
npm run build:win
```

这会走 Tauri 打包链路，避免发布版启动时弹出控制台窗口。打包时 `engines/` 会作为额外资源一起带入应用。
