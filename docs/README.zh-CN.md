# 码到 / MaDao

<p align="center">
  <strong>基于 Rust、Tauri 2 和 React 的内部短信 / OTP 桌面控制台。</strong>
</p>

<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

## 项目简介

码到（MaDao）面向团队内部、自建平台和测试环境，提供统一的桌面控制台，用于管理短信激活、OTP 流程、服务商配置、取码方案和运行时诊断。

它不是公开第三方市场客户端，而是一个可配置的内部运营控制平面。

## 功能特性

- **多服务商短信激活** — 通过统一接口在多个上游服务商之间获取号码、轮询验证码、释放订单
- **取码方案（Routing Plan）** — 命名激活策略，支持顺序 / 随机执行、多轮 failover、价格过滤、自动 replace/failover 工作流
- **Provider Manifest 系统** — 基于 TOML 的声明式配置，运行时热重载，接入新服务商无需改代码
- **号码复用** — 自动复用池，可配置 TTL、最大复用次数和同激活重试，优化成本
- **实时仪表盘** — 在单一控制台查看 ticket 状态、服务商余额、近期活动和运行时日志
- **回调集成** — 为 ticket 注册 webhook URL，daemon 自动将验证码推送到你的业务系统
- **匿名使用统计** — 可选的聚合统计，通过 Cloudflare Worker + D1 实现，提供公开汇总快照
- **桌面 + Docker + API** — 可作为原生桌面应用（macOS / Linux / Windows）、Docker 网页控制台运行，或通过 HTTP API 直接集成
- **自动更新** — 内置 Tauri updater，从 GitHub 拉取签名发布
- **国际化** — UI 支持中英文，运行时切换语言

## 界面截图

| 总览 | 服务商 |
|------|--------|
| ![MaDao 总览仪表盘](./assets/screenshots/madao-overview.png) | ![MaDao 服务商管理](./assets/screenshots/madao-providers.png) |

| 取码方案 | 统计面板 |
|----------|----------|
| ![MaDao 取码方案](./assets/screenshots/madao-routing.png) | ![MaDao 统计面板](./assets/screenshots/madao-stats-dashboard.png) |

## 架构亮点

- **Rust 分层架构** — `plugin-sdk / sms-core / sms-server / apps/daemon / src-tauri`
- **Tauri 2 桌面宿主** + React 19 前端
- **多协议兼容** — `handler_api`、`five_sim`、本地 `mock`
- **可扩展 Manifest** — 通过 `ui`、`behavior` 和 profile 配置扩展 Provider

## 目录结构

```text
.
├── apps/daemon/              # 本地 HTTP / Unix socket 进程入口
├── cloudflare/
│   └── stats-worker/         # Cloudflare Worker + D1 统计聚合服务
├── crates/
│   ├── plugin-sdk/           # Provider manifest 与协议配置模型
│   ├── sms-core/             # 统一领域模型、provider trait、服务层
│   └── sms-server/           # Axum HTTP API 层
├── config/server.toml        # 服务端基础配置
├── plugins/providers/        # 默认 provider manifest 模板
├── src-tauri/                # Tauri 2 桌面宿主
├── ui/                       # React + Vite 前端
└── docs/                     # 架构、provider、发布、开发文档
```

## 快速开始

### 环境要求

- Rust / Cargo（stable）
- Node.js + npm
- Docker / Docker Compose（可选，用于网页部署）

### 桌面模式

```bash
npm run build                    # 构建前端
cargo check --workspace          # 检查 Rust workspace
cargo run -p madao-sms-daemon    # 启动 daemon
cargo run -p madao-tauri         # 启动 Tauri 桌面壳
```

### Docker 模式

```bash
cp .env.docker.example .env
docker compose up -d --build
```

启动后访问 `http://127.0.0.1:8080`。

如果你想直接使用 Docker Hub 预构建镜像：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

已发布的 Docker 镜像支持 `linux/amd64` 和 `linux/arm64`。

### Cloudflare Worker（统计聚合）

`cloudflare/stats-worker/` 目录包含一个 Cloudflare Worker + D1 服务，用于接收匿名统计事件并返回聚合汇总。

启用统计同步后，桌面运行时和 daemon 会大约每分钟自动上传待同步的 Ticket 结果事件。设置页保留 `立即同步` 用于手动补同步。总览统计读取预计算快照，新上传事件需等待 Worker cron 或调用 admin refresh 接口后才会出现。

```bash
cd cloudflare/stats-worker && npm install
npx wrangler login
npx wrangler d1 create madao-stats
```

将返回的 `database_id` 填入 `wrangler.jsonc`，并设置 `API_TOKEN`。数据库表结构由 Worker 首次请求时自动创建。

```bash
npm run dev      # 本地开发
npm run deploy   # 部署到 Cloudflare
```

详见 [cloudflare/stats-worker/README.md](../cloudflare/stats-worker/README.md)。

## 运行时说明

Daemon 在用户配置目录初始化并读取运行时配置，而不是直接写仓库内模板：

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.madao.sms` |
| Linux | `$XDG_CONFIG_HOME/com.madao.sms` 或 `~/.config/com.madao.sms` |

仓库中的 `plugins/providers/*.toml` 仅作为模板，不应保存真实密钥。

### 默认监听地址

| 模式 | 地址 |
|------|------|
| HTTP | `0.0.0.0:7822` |
| Unix socket | `/tmp/madao-sms.sock` |
| Docker 网页端 | `http://127.0.0.1:8080` |
| Docker 内部后端 | `daemon:7822` |
| Docker 配置目录 | `/var/lib/madao` |

### 传输方式

- **macOS / Linux 桌面**：本地 Unix socket
- **Windows 桌面**：内嵌本地 HTTP API
- **浏览器 / API**：HTTP + secret 鉴权

内嵌 HTTP 服务监听所有网卡地址，供外部直接访问。网页端必须先通过 HTTP secret 登录才能进入主页面，受保护的 API 路由需要已登录会话。HTTP secret 持久化到 `runtime-settings.json`，支持重新生成但不支持在 UI 中手动编辑。

Docker 模式下可通过 `MADAO_HTTP_SECRET` 覆盖持久化 secret。修改端口后需重启 daemon 生效。

## 验证命令

```bash
npm run build
cargo check --workspace
cargo test -p sms-core
curl http://127.0.0.1:7822/health
curl http://127.0.0.1:7822/api/provider-manifests
```

## 文档索引

- [架构说明](./architecture.md)
- [API 联动指南](./api-integration.md)
- [Daemon API 参考](./daemon-api.md)
- [OpenAPI / Swagger UI](./openapi/index.html)
- [Provider 协议兼容说明](./providers.md)
- [取码方案（Routing Plans）](./routing-plans.md)
- [开发与验证说明](./development.md)
- [Docker 部署说明](./docker.zh-CN.md)
- [统计聚合服务](../cloudflare/stats-worker/README.md)
- [发布说明](./release.md)
- [贡献指南](../CONTRIBUTING.md)
- [安全策略](../SECURITY.md)
- [版本历史](https://github.com/netcookies/MaDao/releases)

## 许可证与品牌

本项目基于 [GNU Affero General Public License v3.0 only](../LICENSE) 发布。

`MaDao` 名称、Logo、发布渠道和官方项目身份受 [Trademark Policy](../TRADEMARKS.md) 约束。修改版本不得暗示官方背书，也不得在未获许可时使用容易混淆的品牌标识。

## 友情链接

- [LINUX DO](https://linux.do)
