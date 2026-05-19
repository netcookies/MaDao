# 码到 / MaDao

<p align="center">
  <strong>基于 Rust、Tauri 2 和 React 的内部短信 / OTP 桌面控制台。</strong>
</p>

<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

## 项目简介

`码到（MaDao）` 面向团队内部、自建平台和测试环境，提供统一的桌面控制台，用于管理短信激活、OTP 流程、provider manifests、routing plans 和运行时诊断。

它不是公开第三方市场客户端，而是一个可配置的内部运营控制平面。

## 核心能力

- Rust workspace 分层：`plugin-sdk / sms-core / sms-server / apps/daemon / src-tauri`
- Tauri 2 桌面宿主 + React 前端
- 使用 `TOML` 管理 provider manifests，并支持运行时热重载
- 兼容以下 provider 协议风格：
  - `handler_api`
  - `five_sim`
  - 本地 `mock`
- 支持 routing plans、余额查询、价格获取、日志与激活记录
- 支持通过 manifest 的 `ui`、`behavior` 和 profile 配置扩展 provider

## 目录结构

```text
.
├── apps/daemon/              # 本地 HTTP / Unix socket 进程入口
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

- Rust / Cargo
- Node.js
- npm
- Docker / Docker Compose（可选，用于网页部署）

### 构建前端

```bash
npm run build
```

### 检查 Rust workspace

```bash
cargo check --workspace
```

### 启动 daemon

```bash
cargo run -p madao-sms-daemon
```

### 启动 Tauri 桌面壳

```bash
cargo run -p madao-tauri
```

### 一键部署 Docker 模式

```bash
cp .env.docker.example .env
docker compose up -d --build
```

启动后访问 `http://127.0.0.1:8080`。

如果你想直接使用 Docker Hub 预构建镜像，而不是在本地构建，可执行：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

已发布的 Docker 镜像支持 `linux/amd64` 和 `linux/arm64`。

## 运行时说明

默认情况下，daemon 会在用户配置目录初始化并读取运行时配置，而不是直接写仓库内模板：

- macOS：`~/Library/Application Support/com.madao.sms`
- Linux：`$XDG_CONFIG_HOME/com.madao.sms` 或 `~/.config/com.madao.sms`

仓库中的 `plugins/providers/*.toml` 仅作为模板，不应保存真实密钥。

默认监听地址：

- HTTP：`0.0.0.0:7822`
- Unix socket：`/tmp/madao-sms.sock`

Docker 模式下：

- 网页端入口：`http://127.0.0.1:8080`
- `compose` 内部后端地址：`daemon:7822`
- 容器内运行配置目录：`/var/lib/madao`

桌面模式下，应用 UI 现在通过本地 Unix socket 与后端通信，而不是直接走 HTTP API；同时内嵌 HTTP 服务会监听所有网卡地址，供外部直接访问。

独立 HTTP 访问用于浏览器 / API 场景：

- 网页端必须先通过 HTTP secret 登录，才能进入主页面
- 受保护的 HTTP API 路由需要已登录会话
- HTTP secret 会持久化到 `runtime-settings.json`，支持重新随机生成，但不支持在 UI 中手动编辑

Docker 模式下：

- 可通过 `MADAO_HTTP_SECRET` 覆盖持久化的 HTTP secret
- 如果没有设置 `MADAO_HTTP_SECRET`，则使用持久化配置中的 secret
- 修改持久化的 HTTP 端口后，需要重启 daemon 才会生效

## 验证命令

```bash
npm run build
cargo check --workspace
cargo test -p sms-core
```

快速冒烟：

```bash
curl http://127.0.0.1:7822/health
curl http://127.0.0.1:7822/api/provider-manifests
```

## 文档索引

- [Architecture](./architecture.md)
- [API 联动指南](./api-integration.md)
- [OpenAPI / Swagger UI](./openapi/index.html)
- [Provider 协议兼容说明](./providers.md)
- [Routing Plans](./routing-plans.md)
- [开发与验证说明](./development.md)
- [Docker 部署说明](./docker.zh-CN.md)
- [发布说明](./release.md)
- [贡献指南](../CONTRIBUTING.md)

## License

本项目基于 [MIT License](../LICENSE) 发布。
