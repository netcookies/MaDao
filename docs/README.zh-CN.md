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

## 运行时说明

默认情况下，daemon 会在用户配置目录初始化并读取运行时配置，而不是直接写仓库内模板：

- macOS：`~/Library/Application Support/com.madao.sms`
- Linux：`$XDG_CONFIG_HOME/com.madao.sms` 或 `~/.config/com.madao.sms`

仓库中的 `plugins/providers/*.toml` 仅作为模板，不应保存真实密钥。

默认监听地址：

- HTTP：`127.0.0.1:7822`
- Unix socket：`/tmp/madao-sms.sock`

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
- [Provider 协议兼容说明](./providers.md)
- [Routing Plans](./routing-plans.md)
- [开发与验证说明](./development.md)
- [发布说明](./release.md)
- [贡献指南](../CONTRIBUTING.md)

## License

本项目基于 [MIT License](../LICENSE) 发布。
