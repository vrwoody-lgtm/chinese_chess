# 发布到 GitHub Release

本项目提供两种方式把安装包（Windows / macOS）发布到 GitHub Release。

- Windows 产物：`.msi`（安装包）、`.exe`（NSIS 安装版）、`portable.exe`（便携版，免安装）
- macOS 产物：`.dmg`（安装镜像）、`*.app.zip`（便携版 App）

---

## 方式一：自动 CI（推荐）

打一个 `v*` 开头的 tag 并 push，GitHub Actions 会在 Windows 和 macOS 两台
runner 上分别构建，并把所有产物上传到同名 Release。

```bash
# 1. 确保本地已提交并推送最新代码
git add .
git commit -m "chore: release v0.2.0"
git push

# 2. 打 tag 并推送（tag 名必须以 v 开头，如 v0.2.0）
git tag v0.2.0
git push origin v0.2.0
```

推送 tag 后，到仓库 **Actions** 页面查看 `Release Build` 工作流。
完成后在 **Releases** 页面即可看到包含 Windows + macOS 产物的发布。

> 可在仓库 **Actions** 标签页手动 `Run workflow` 重新触发（不依赖 tag）。

### CI 签名（可选）

若要对安装包做代码签名 / 更新签名，请在仓库
**Settings → Secrets and variables → Actions** 中添加：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri 签名私钥
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码（如有）

未配置时 CI 仍能正常构建并发布未签名安装包。

---

## 方式二：手动打包并上传

适合在本地或两台机器分别构建后，手动上传到同一个 Release。

### 1. 构建

在**对应平台**的机器上：

```bash
npm install
npm run tauri:build
```

产物位于：

- Windows：`src-tauri/target/release/bundle/{msi,nsis,portable}/`
- macOS：`src-tauri/target/release/bundle/{dmg,macos}/`

### 2. 上传到 Release

需要已安装并登录 [GitHub CLI](https://cli.github.com/)：

```bash
gh auth login   # 首次使用
bash scripts/publish-release.sh v0.2.0
```

Windows 机器和 macOS 机器**各自运行一次**上面的脚本，产物会累积到同一个
Release（如 `v0.2.0`）。脚本会自动创建 Release（draft 状态）并上传产物。
最后到 GitHub **Releases** 页面把 draft 发布出去即可。

> 未安装 `gh` 时，也可在本地构建后，到 GitHub 仓库 **Releases → Draft a new release**，
> 手动把 `bundle` 目录下对应的 `.msi` / `.exe` / `portable.exe` / `.dmg` / `*.app.zip`
> 拖拽上传。

---

## 注意事项

- `pikafish.exe`（Windows 引擎）已加入 `src-tauri/tauri.conf.json` 的
  `bundle.resources`，Windows 打包才会包含引擎。修改资源后务必重新构建。
- `pikafish.nnue` 体积较大，已由 Git LFS 管理（见 `PROJECT_NOTES.md`）。
  CI 中已开启 `lfs: true` 以确保拉取完整引擎文件。
- 发布前确认 `package.json` 与 `tauri.conf.json` 中的 `version` 一致。
