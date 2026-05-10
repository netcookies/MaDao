# MaDao

`MaDao` 是一个基于 `Rust + Tauri 2 + React` 的内部协议兼容控制台，面向团队自建平台的通知 / OTP 测试能力。

当前版本保留了插件式 provider 架构，并支持通过配置兼容以下协议风格：

- `HeroSMS` 风格 `handler_api`
- `SmsBower` 风格 `handler_api`
- `5SIM` 风格 REST API
- 本地 `mock provider`

项目目标不是对接公开第三方市场，而是为团队内部、自建平台提供统一的：

- provider 插件接入
- `HTTP / socket / Tauri` 通信
- provider manifest 配置读写与热重载
- Apple 风格桌面运维控制台

## 当前能力

- Rust workspace 已分层为 `plugin-sdk / sms-core / sms-server / daemon / src-tauri`
- provider manifests 模板使用 `TOML` 管理，仓库模板位于 `plugins/providers/*.toml`
- 支持 provider manifest：
  - 列表
  - 单项读取
  - 保存
  - 运行时热重载
- 支持运行时接口：
  - `GET /health`
  - `GET /api/providers`
  - `GET /api/provider-manifests`
  - `GET /api/providers/{id}/manifest`
  - `PUT /api/providers/{id}/manifest`
  - `POST /api/provider-manifests/reload`
  - `GET /api/providers/{id}/balance`
  - `POST /api/providers/{id}/prices`
- 前端已重构为 Apple 风格控制台，支持：
  - provider 切换
  - routing plans 主功能页
  - manifest 表单编辑
  - 原始 JSON 编辑
  - 保存并热重载
  - 余额与价格面板查询
  - 运行时快照、日志、会话展示
  - Tailwind 化的桌面组件体系

## 目录结构

```text
.
├── apps/daemon/              # 本地 HTTP / Unix socket 进程入口
├── crates/
│   ├── plugin-sdk/           # provider manifest 与协议配置模型
│   ├── sms-core/             # 统一领域模型、provider trait、服务层
│   └── sms-server/           # axum HTTP 路由层
├── config/server.toml        # 服务端基础配置
├── plugins/providers/        # provider manifest 模板
├── src-tauri/                # Tauri 2 桌面宿主
├── ui/                       # React + Vite 前端
└── DESIGN.md                 # Apple 风格设计规范
```

## 开发环境

需要：

- `Rust` / `cargo`
- `Node.js`
- `npm`

本机已验证版本可正常构建。

前端样式栈：

- `Tailwind CSS`
- `PostCSS + Autoprefixer`
- `design token + CSS variables`

## 启动方式

### 1. 构建前端

```bash
npm run build
```

### 2. 检查 Rust workspace

```bash
cargo check --workspace
```

### 3. 启动本地 daemon

```bash
cargo run -p madao-sms-daemon
```

默认会初始化并读取用户配置目录：

- macOS：`~/Library/Application Support/com.madao.sms`
- Linux：`$XDG_CONFIG_HOME/com.madao.sms` 或 `~/.config/com.madao.sms`

其中 `providers/*.toml` 为实际运行时副本；仓库里的 `plugins/providers/*.toml` 仅作为默认模板，不应保存真实 `api_key`。

默认监听：

- HTTP: `127.0.0.1:7822`
- Unix socket: `/tmp/madao-sms.sock`

### 4. 启动 Tauri 开发壳

如果你要直接起桌面壳，可以在项目根目录执行：

```bash
cargo run -p madao-tauri
```

或按 Tauri 常规开发方式运行。

## 验证命令

### Rust 测试

```bash
cargo test -p sms-core
```

### Workspace 编译检查

```bash
cargo check --workspace
```

### 前端构建检查

```bash
npm run build
```

### HTTP 冒烟

```bash
curl http://127.0.0.1:7822/health
curl http://127.0.0.1:7822/api/provider-manifests
```

## 设计规范

Apple 风格设计规范已通过以下命令导入：

```bash
npx getdesign@latest add apple --out ./DESIGN.md
```

后续任何 UI 调整都应先参考 `DESIGN.md`。

如果修改前端主题或样式基础设施，请同步检查：

- `ui/src/design-system/theme.css`
- `ui/src/design-system/tailwind-theme.cjs`
- `tailwind.config.cjs`

## 文档

- [架构说明](docs/architecture.md)
- [Provider 协议兼容说明](docs/providers.md)
- [Routing Plans 说明](docs/routing-plans.md)
- [开发与验证说明](docs/development.md)
