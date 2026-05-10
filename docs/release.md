# 自动发布

仓库提供了 GitHub Actions 发布工作流：

```text
.github/workflows/release.yml
```

## 触发方式

推荐通过推送语义化 tag 触发：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会在以下平台自动构建桌面二进制：

- macOS
- Linux
- Windows

并把产物上传到对应的 GitHub Release。

## 工作流内容

发布前会执行：

```bash
npm ci
npm run build
cargo check --workspace
cargo test -p sms-core
```

通过后再调用 `tauri-apps/tauri-action` 打包各平台桌面产物。

## 版本来源

- Tauri bundle 版本默认回退到 workspace `Cargo.toml` 的 `[workspace.package].version`
- 前端 Settings 页展示版本也读取同一份 workspace 版本号

因此发布版本建议以 workspace `Cargo.toml` 为单一 source of truth。

## 产物说明

不同平台会由 Tauri 自动输出对应格式的安装包 / bundle，具体取决于 runner 平台与 Tauri bundler 支持：

- macOS：`.app` / `.dmg`
- Linux：如 `.AppImage` / `.deb`
- Windows：如 `.msi` / `.exe`

实际生成格式以当次 Tauri bundler 输出为准。
