# Development

## 已验证状态

当前仓库已验证通过：

```bash
cargo test -p sms-core
cargo check --workspace
npm run build
```

并做过运行态冒烟：

- `GET /health`
- `GET /api/provider-manifests`
- `GET /api/providers/mock/manifest`
- `PUT /api/providers/mock/manifest`
- `POST /api/provider-manifests/reload`

## Git

仓库已初始化 Git：

```bash
git init
```

当前仓库已经完成初始化提交，可继续按功能粒度提交后续修改。

## 补充文档

- app / daemon API 联动见 [docs/api-integration.md](api-integration.md)
- 接入更多服务商与代码贡献见 [CONTRIBUTING.md](/Users/isulewli/Projects/MaDao/CONTRIBUTING.md)
- 自动化多平台发布见 [docs/release.md](release.md)

## 常用命令

### Rust

```bash
cargo check --workspace
cargo test -p sms-core
```

### 前端

```bash
npm run build
```

如果你要以浏览器模式本地联调前端：

```bash
VITE_RUNTIME_MODE=web npm run dev
```

默认会通过 Vite 代理把 `/api` 和 `/health` 转发到：

```text
http://127.0.0.1:7822
```

当前前端样式栈为：

- `Tailwind CSS`
- `PostCSS + Autoprefixer`
- `design token + CSS variables`

关键配置文件：

- `tailwind.config.cjs`
- `postcss.config.cjs`
- `ui/src/tailwind.css`
- `ui/src/design-system/theme.css`
- `ui/src/design-system/tailwind-theme.cjs`

### 更新检查

设置页支持：

- `每次打开时检查更新`
- `检查更新`

更新信息来源于：

```text
https://github.com/netcookies/MaDao
```

前端实际请求 latest release API：

```text
https://api.github.com/repos/netcookies/MaDao/releases/latest
```

### 启动 daemon

```bash
cargo run -p madao-sms-daemon
```

默认情况下，daemon 会自动初始化并使用用户配置目录，而不是直接读写仓库内的 `config/` 与 `plugins/providers/`：

- macOS：`~/Library/Application Support/com.madao.sms`
- Linux：`$XDG_CONFIG_HOME/com.madao.sms` 或 `~/.config/com.madao.sms`

如果你显式传入配置文件路径，例如 `cargo run -p madao-sms-daemon -- /path/to/config.toml`，则会按该路径运行。

### 查看 provider manifests

```bash
curl http://127.0.0.1:7822/api/provider-manifests
```

### 读取单个 manifest

```bash
curl http://127.0.0.1:7822/api/providers/mock/manifest
```

### 保存单个 manifest

```bash
curl -X PUT http://127.0.0.1:7822/api/providers/mock/manifest \
  -H 'Content-Type: application/json' \
  -d @manifest.json
```

### 热重载 manifests

```bash
curl -X POST http://127.0.0.1:7822/api/provider-manifests/reload
```

## Docker 模式

一键启动：

```bash
cp .env.docker.example .env
docker compose up -d --build
```

默认网页入口：

```text
http://127.0.0.1:8080
```

Docker 模式最小验收：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```

当前这套 `docker compose` 已实际验证通过：

- `docker compose build`
- `docker compose up -d`
- `daemon` 健康检查通过
- `web -> daemon` 反向代理链路正常

## Tauri / UI 现状

当前前端已经可以构建，Tauri 侧也能通过 workspace 编译检查。

当前最小前端回归命令：

```bash
npm run build
cargo check -p madao-tauri
```

如果你问“现在能编译打开测试了吗”，答案是：

- `能编译`：是。
- `能构建前端`：是。
- `能启动 daemon 并测试接口`：是。
- `能打开桌面壳做完整交互验收`：代码层面已具备基础条件，但我这一轮主要验证的是编译、构建和后端 API 冒烟，不是完整桌面交互录屏式验收。

如需继续验收，建议下一步优先做：

1. 以你们内部平台真实响应样例补充 protocol contract tests。
2. 增加桌面端手工交互验收清单。
3. 基于 `designs/new.pen` 更新 Tailwind 迁移后的视觉对齐基线。
