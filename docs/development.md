# Development

## 验证状态

当前仓库已验证通过：

```bash
cargo test -p sms-core
cargo check --workspace
npm run build
```

运行态冒烟已覆盖：`GET /health`、`GET /api/provider-manifests`、`GET /api/providers/mock/manifest`、`PUT /api/providers/mock/manifest`、`POST /api/provider-manifests/reload`。

## 常用命令

### Rust

```bash
cargo check --workspace
cargo test -p sms-core
cargo run -p madao-sms-daemon
```

Daemon 默认使用用户配置目录（macOS: `~/Library/Application Support/com.madao.sms`，Linux: `~/.config/com.madao.sms`）。显式传入路径可覆盖：`cargo run -p madao-sms-daemon -- /path/to/config.toml`。

### 前端

```bash
npm run build
npm run check:openapi-sync
```

浏览器模式本地联调：

```bash
VITE_RUNTIME_MODE=web npm run dev
```

Vite 代理会把 `/api` 和 `/health` 转发到 `http://0.0.0.0:7822`。

### 样式体系

当前前端样式栈：Tailwind CSS + PostCSS + Autoprefixer + design token + CSS variables。

关键配置文件：

- `tailwind.config.cjs` / `postcss.config.cjs`
- `ui/src/tailwind.css`
- `ui/src/design-system/theme.css`
- `ui/src/design-system/tailwind-theme.cjs`

### 更新检查

设置页支持 `每次打开时检查更新` 和 `检查更新`。更新信息来源于 GitHub Release API：

```text
https://api.github.com/repos/netcookies/MaDao/releases/latest
```

### Manifest 操作

```bash
curl http://127.0.0.1:7822/api/provider-manifests          # 查看所有
curl http://127.0.0.1:7822/api/providers/mock/manifest     # 读取单个
curl -X PUT http://127.0.0.1:7822/api/providers/mock/manifest \
  -H 'Content-Type: application/json' -d @manifest.json    # 保存
curl -X POST http://127.0.0.1:7822/api/provider-manifests/reload  # 热重载
```

## Docker 模式

```bash
cp .env.docker.example .env
docker compose up -d --build
```

默认网页入口：`http://127.0.0.1:8080`

验收命令：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```

## OpenAPI / Swagger UI

规范文件：`docs/openapi/daemon.openapi.yaml`

```bash
npm run check:openapi-sync    # 校验路由同步
```

该检查核对 OpenAPI 是否包含当前所有 daemon HTTP 路由，防止”加了路由却忘了更新 OpenAPI”的漂移。

### 部署

仓库内置 GitHub Pages 自动部署（`.github/workflows/openapi-pages.yml`），也可部署到 Cloudflare Pages（Output directory: `docs/openapi`）。

### 桌面模式传输

- macOS / Linux：UI 通过本地 socket 与后端通信
- Windows：UI 通过内嵌本地 HTTP API 与后端通信
- 内嵌 HTTP 服务监听所有网卡地址，供外部直接访问

## 最小回归命令

```bash
npm run build
cargo check -p madao-tauri
```

## 国际化（i18n）

前端使用 `i18next` + `react-i18next`，配置入口：`ui/src/app/i18n.ts`。

当前支持语言：`en`（英文）、`zh`（中文）。翻译 key 内联在 `i18n.ts` 的 `resources` 对象中。

添加新 key：

1. 在 `resources.en.translation` 中添加英文 key
2. 在 `resources.zh.translation` 中添加对应中文 key
3. 组件中使用 `useTranslation()` hook 的 `t('key_name')` 调用

添加新语言：

1. 在 `resources` 中添加新的 locale 对象（如 `ja: { translation: { ... } }`）
2. 在 `ui/src/app/language.tsx` 中注册语言选项

运行时语言切换通过 Settings 页面完成，无需重启应用。

## 相关文档

- [API 联动指南](api-integration.md)
- [OpenAPI 规范](openapi/daemon.openapi.yaml)
- [Swagger UI](openapi/index.html)
- [贡献指南](../CONTRIBUTING.md)
- [发布说明](release.md)
