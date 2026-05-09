# 中国象棋

这是一个中国象棋桌面项目。浏览器直接打开 `index.html` 时会使用内置 JavaScript 电脑方；通过 Tauri 或 Electron 启动时，可以接入 Pikafish/UCI/UCCI 象棋引擎。

## 推荐：Tauri 启动和打包

Tauri 体积比 Electron 小很多，但需要先安装 Rust 工具链。

```bash
npm install
npm run tauri:dev
```

打包：

```bash
npm run tauri:build
```

Tauri 会使用 `tauri-web/` 作为前端发布目录。它由下面的命令从根目录的 `index.html`、`styles.css`、`game.js` 同步生成：

```bash
npm run tauri:sync
```

## Electron 启动

```bash
npm install
npm start
```

## 接入 UCCI 引擎

把 UCCI 兼容引擎放入 `engines/` 目录，推荐命名：

- Windows: `engines/pikafish.exe`
- macOS/Linux: `engines/pikafish`

也可以用环境变量指定绝对路径：

```bash
CHESS_ENGINE_PATH=/absolute/path/to/pikafish npm start
```

有引擎时，前端会发送当前局面的 FEN，主进程通过 UCCI 协议请求最佳走法，并把 `bestmove` 返回给棋盘执行。没有引擎时会自动退回内置电脑方。
Pikafish 通常使用 UCI 协议，项目会自动兼容 UCI/UCCI。

## Windows 打包

```bash
npm run build:win
```

这会走 Tauri 打包链路，避免发布版启动时弹出控制台窗口。打包时 `engines/` 会作为额外资源一起带入应用。

旧的 Electron Windows 打包脚本保留为：

```bash
npm run build:win:electron
```
