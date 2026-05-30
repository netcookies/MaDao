# 自动发布

相关文件：

- `.github/workflows/release.yml` — 桌面端构建
- `.github/workflows/docker-publish.yml` — Docker 镜像发布
- `scripts/release.mjs` — 本地一键发布脚本
- `scripts/generate-release-notes.mjs` — 发版说明生成

## 推荐发布方式

```bash
npm run release -- patch          # 自动 patch 版本
npm run release -- 0.2.0          # 显式指定版本
npm run release -- 0.2.1-beta.1   # 预发布版本
npm run release -- patch --dry-run  # 预演，不改文件
```

脚本执行流程：

1. 检查 Git 工作区干净
2. 提升 `Cargo.toml`、`Cargo.lock`、`package.json`、`package-lock.json` 版本号
3. 本地校验（`npm run build` + `cargo check` + `cargo test`）
4. 创建提交 `chore: 发布 vX.Y.Z` + annotated tag
5. 生成本地发版说明预览（`.git/release-notes-vX.Y.Z.md`）
6. 推送分支和 tag，触发 CI

本地生成发版说明预览：

```bash
npm run release:notes -- --current-tag v0.2.0 --to-ref HEAD --no-ai
```

## CI 触发

推送语义化 tag 即触发 CI：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

CI 自动构建以下平台的桌面二进制并上传到 GitHub Release：

- macOS arm64 / amd64
- Linux amd64
- Windows amd64

同一个 tag 也会触发 Docker Hub 镜像发布。

## 构建流程

CI 先自动生成发版说明，然后在各平台执行：

```bash
npm ci && npm run build
cargo check --workspace
cargo test -p sms-core
```

通过后调用 `tauri-apps/tauri-action` 打包桌面产物，并生成 Tauri updater 所需的更新元数据和签名。

应用内检查更新使用固定 endpoint：

```text
https://github.com/netcookies/MaDao/releases/latest/download/latest.json
```

客户端只内置 updater 公钥和 endpoint，不内置 GitHub token。公开仓库的 release asset 可直接下载。

## 桌面在线更新

在线更新依赖 Tauri updater signing key。私钥只放在 GitHub Actions secrets 或本机安全目录。

本机 signing key 建议路径：

```text
~/.tauri/madao-updater.key      # chmod 600
~/.tauri/madao-updater.key.pub
```

GitHub 仓库 secrets：

- `TAURI_SIGNING_PRIVATE_KEY` — 私钥完整内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — 私钥密码（无密码可留空）

macOS 目前未配置 Apple Developer ID 签名和 notarization。更新安装后会 best-effort 执行 `xattr -dr com.apple.quarantine`，仅作为过渡兜底。

## Docker Hub 发布

Docker Hub workflow 基于同一个 `v*` tag 构建并推送：

- `netcookies/madao-daemon:<version>` + `latest` + `sha-*`
- `netcookies/madao-web:<version>` + `latest` + `sha-*`

架构：`linux/amd64` + `linux/arm64`

GitHub 仓库需配置：

- `DOCKERHUB_USERNAME` — Docker Hub 用户名
- `DOCKERHUB_TOKEN` — Docker Hub Access Token

Docker Hub 中需提前创建 `madao-daemon` 和 `madao-web` 仓库。

## 架构支持范围

| 产物 | amd64 | arm64 |
|------|-------|-------|
| Docker 镜像 | ✓ | ✓ |
| macOS 桌面 | ✓ | ✓ |
| Linux 桌面 | ✓ | — |
| Windows 桌面 | ✓ | — |

Linux / Windows 桌面的 arm64 需要自托管 runner。

## 发版说明

由 `scripts/generate-release-notes.mjs` 生成：

- 默认比较当前 tag 与上一个稳定 tag
- 预发布 tag 会回看上一个已合并 tag
- 自动忽略 `chore: 发布 vX.Y.Z` 提交
- 优先调用 GitHub Models 生成中文说明，AI 不可用时回退为 Conventional Commits 分组
- 正文最下方追加折叠的英文说明

CI 即使没有 AI 响应也不会阻塞发布。

## 版本来源

Tauri bundle 版本和前端 Settings 页版本都读取 workspace `Cargo.toml` 的 `[workspace.package].version`，以此为单一 source of truth。

## 产物格式

| 平台 | 格式 |
|------|------|
| macOS | `.app` / `.dmg` |
| Linux | `.AppImage` / `.deb` |
| Windows | `.msi` / `.exe` |

所有平台统一使用 ASCII `productName: MaDao`，GitHub Release 附件名模式为 `madao-vX.Y.Z-[platform]-[arch][setup].[ext]`。

## macOS 签名说明

当前 macOS 产物未签名、未 notarize。用户下载后可能被 Gatekeeper 标记 quarantine。

清理方法：

```bash
xattr -dr com.apple.quarantine ~/Downloads/码到.dmg
xattr -dr com.apple.quarantine /Applications/MaDao.app
```

后续面向更广泛分发时建议补齐 Apple 证书签名与 notarization。
