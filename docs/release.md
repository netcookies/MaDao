# 自动发布

仓库提供了 GitHub Actions 发布工作流，以及本地一键发布脚本：

```text
.github/workflows/release.yml
.github/workflows/docker-publish.yml
scripts/release.mjs
scripts/generate-release-notes.mjs
```

## 推荐发布方式

推荐直接使用项目脚本完成版本提升、校验、打 tag 和推送：

```bash
npm run release -- patch
```

也可以显式指定版本：

```bash
npm run release -- 0.2.0
npm run release -- 0.2.1-beta.1
```

脚本会按顺序执行：

1. 检查 Git 工作区必须干净。
2. 提升 `Cargo.toml`、`Cargo.lock`、`package.json`、`package-lock.json` 的版本号。
3. 执行本地校验：

```bash
npm run build
cargo check --workspace
cargo test -p sms-core
```

4. 创建提交：`chore: 发布 vX.Y.Z`
5. 创建 annotated tag：`vX.Y.Z`
6. 生成本地发版说明预览：`.git/release-notes-vX.Y.Z.md`
7. 推送当前分支和 tag，触发 GitHub Actions 发布

如果只想预演，不改文件：

```bash
npm run release -- patch --dry-run
```

如果只想本地生成发版说明预览：

```bash
npm run release:notes -- --current-tag v0.2.0 --to-ref HEAD --no-ai
```

## CI 触发方式

CI 仍然通过推送语义化 tag 触发：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会在以下平台自动构建桌面二进制：

- macOS arm64
- macOS amd64
- Linux amd64
- Windows amd64

并把产物上传到对应的 GitHub Release。

同一个 tag 也会触发 Docker Hub 镜像发布工作流。

## 工作流内容

工作流会先自动生成发版说明，再在以下平台构建：

- macOS arm64
- macOS amd64
- Linux amd64
- Windows amd64

构建前会执行：

```bash
npm ci
npm run build
cargo check --workspace
cargo test -p sms-core
```

通过后再调用 `tauri-apps/tauri-action` 打包各平台桌面产物，并把自动生成的发版说明写入 GitHub Release。

Docker Hub 工作流会基于同一个 `v*` tag 构建并推送两个镜像：

- `DOCKERHUB_USERNAME/madao-daemon:<version>`
- `DOCKERHUB_USERNAME/madao-web:<version>`
- 以及对应的 `latest`、`sha-*` 标签

当前镜像发布使用 `Dockerfile` 的两个 target：

- `daemon`
- `web`

当前 workflow 会同时发布：

- `linux/amd64`
- `linux/arm64`

## Docker Hub 发布配置

要让 Docker Hub 自动发布成功，需要先在 GitHub 仓库中配置以下 secrets：

- `DOCKERHUB_USERNAME`：Docker Hub 用户名，例如 `netcookies`
- `DOCKERHUB_TOKEN`：Docker Hub Access Token

然后在 Docker Hub 中提前创建仓库：

- `DOCKERHUB_USERNAME/madao-daemon`
- `DOCKERHUB_USERNAME/madao-web`

之后每次执行：

```bash
npm run release -- patch
```

推送出的 `vX.Y.Z` tag 会同时触发：

- 桌面端 GitHub Release 构建
- Docker Hub 镜像构建与推送

## 当前架构支持范围

当前 CI 已覆盖：

- Docker 镜像：`linux/amd64`、`linux/arm64`
- 桌面 macOS 安装包：`amd64`、`arm64`
- 桌面 Linux 安装包：`amd64`
- 桌面 Windows 安装包：`amd64`

之所以桌面 Linux / Windows 目前没有 `arm64` 安装包，是因为当前使用 GitHub Hosted runners，而默认可用 runner 只稳定覆盖：

- Ubuntu `x64`
- Windows `x64`
- macOS `x64` / `arm64`

如果后续要补桌面 Linux / Windows 的 `arm64` 安装包，需要额外提供对应平台的自托管 `arm64 runner`。

## 发版说明来源

发版说明由 `scripts/generate-release-notes.mjs` 生成，规则如下：

- 默认比较 `当前 tag` 与 `上一个稳定 tag`
- 预发布 tag（如 `v0.2.1-beta.1`）会回看上一个已合并 tag
- 自动忽略 `chore: 发布 vX.Y.Z` 这类发布提交
- 优先调用 GitHub Models 生成面向用户的中文说明
- 如果 AI 不可用，则回退为基于 Conventional Commits 的稳定分组说明
- 在发布正文最下方追加折叠的英文说明
- 英文折叠段位于“提交明细”之前

因此 CI 即使没有 AI 响应，也不会阻塞正式发布。

## 版本来源

- Tauri bundle 版本默认回退到 workspace `Cargo.toml` 的 `[workspace.package].version`
- 前端 Settings 页展示版本也读取同一份 workspace 版本号

因此发布版本建议以 workspace `Cargo.toml` 为单一 source of truth。

## 产物说明

不同平台会由 Tauri 自动输出对应格式的安装包 / bundle，具体取决于 runner 平台与 Tauri bundler 支持：

- macOS：通常为 `.app` / `.dmg`
- Linux：如 `.AppImage` / `.deb`
- Windows：如 `.msi` / `.exe`

实际生成格式以当次 Tauri bundler 输出为准。

为避免安装包内部实际文件名与 GitHub Release assets 出现中文文件名，项目通过平台专用 Tauri 配置对桌面平台统一覆盖 ASCII `productName`，并在上传 GitHub Release 附件时统一覆盖附件名模式：

```text
macOS productName: MaDao
Linux productName: MaDao
Windows productName: MaDao
madao-vX.Y.Z-[platform]-[arch][setup].[ext]
```

因此 macOS `.app` / `.dmg`、Linux 包内应用名、Windows MSI / EXE 与 GitHub Release 附件名都不会使用中文，也不会回退成默认的 `-vX.Y.Z.*` 形式。

## macOS 签名说明

当前 workflow 只执行 `tauri-apps/tauri-action` 打包，没有配置 Apple Developer 签名或 notarization 所需的 secrets / 环境变量，因此：

- 当前 macOS 产物默认是`未签名`、`未 notarize`的
- 在 macOS runner 上通常仍会生成 `.app` 和 `.dmg`
- 用户从浏览器下载后，可能会被 Gatekeeper 标记 `com.apple.quarantine`

如果下载后的 `.dmg` 或 `.app` 无法直接打开，可以先清理 quarantine 标记。

对 `.dmg`：

```bash
xattr -dr com.apple.quarantine ~/Downloads/码到.dmg
```

把应用拖到 `Applications` 后，如果 `.app` 仍然被拦截，再执行：

```bash
xattr -dr com.apple.quarantine /Applications/码到.app
```

如果应用不在 `Applications`，把路径替换成实际位置即可。

`xattr` 只是移除本机下载隔离标记，不等同于正式签名或 notarization。后续如果要面向更广泛的 macOS 分发，建议再补 Apple 证书签名与 notarization 流程。
