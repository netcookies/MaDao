# Architecture

## 总览

MaDao 采用分层架构，目标是让协议兼容、运行时状态、桌面宿主和前端控制台解耦：

```text
plugin-sdk → sms-core → sms-server → apps/daemon → src-tauri → ui
```

## 分层说明

### `crates/plugin-sdk`

Provider manifest 的单一结构定义源：

- `ProviderManifest` / `ProviderKind`
- `HandlerApiConfig` / `FiveSimConfig` / `MockConfig`
- Provider 的 `ui` / `behavior` 配置
- 协议兼容所需的默认配置项

### `crates/sms-core`

系统的领域中心：

- 统一领域模型（请求 / 响应 / runtime snapshot / provider summary）
- `SmsProvider` trait 及各实现（`HeroSms` / `SmsBower` / `FiveSim` / `Mock`）
- `ProviderRegistry` / `SmsService`
- 运行时缓存 OpenAI 短信区域配置

同协议下的实现差异优先通过 manifest profile 选择（如 `handler_api.profile = "smsbower"`），而不是按 provider id 硬编码。

### `crates/sms-server`

HTTP API 层，把 `SmsService` 映射为外部可调用接口：

- Runtime snapshot / provider manifest CRUD / reload
- Balance / prices
- Activation / routing / callback API（详见 [daemon-api.md](daemon-api.md)）

### `apps/daemon`

本地宿主进程，不承担领域规则：

- HTTP 服务 + Unix socket
- 本地 JSON command 协议

### `src-tauri`

桌面桥接层，只做 Tauri commands 和挂载共享 `SmsService`，不写业务规则。

### `ui`

React 前端控制台：

- Provider manifest 编辑
- 余额 / 价格 / 运行时状态展示
- 通过 HTTP 直接读取后端 API

## 运行时流

```text
provider manifest (*.toml)
  → ProviderRegistry
  → SmsService
  → HTTP / socket / Tauri
  → React UI
```

Manifest 不仅承载协议参数，也承载少量 provider-specific 元数据（UI 展示、行为差异等），优先从 manifest 读取以避免前后端按 provider id 写死分支。

## OpenAI 短信国家过滤

设置页的 `仅显示 OpenAI 短信可用国家` 语义为：

```text
当前平台支持国家 - (whatsapp_regions - sms_regions)
```

即：`sms_regions` 是显式保留名单，`whatsapp_regions` 只用于排除 whatsapp-only 国家。同时存在于两者中的国家仍然显示。

此规则必须在以下层面保持一致：Rust 侧区域缓存、runtime settings、UI 国家选择器、API / OpenAPI 文档。

## 热重载流

```text
UI 编辑 manifest
  → PUT /api/providers/{id}/manifest
  → SmsService::save_provider_manifest
  → ProviderRegistry::save_manifest
  → ProviderRegistry::reload
  → runtime snapshot 立即反映
```

## 匿名统计

```text
Ticket 结果事件 → 本地队列 → 定时批量上传 → Cloudflare Worker → D1
                                                    ↓
                                          Cron 刷新快照
                                                    ↓
                                          GET /v1/summary（公开）
```

- 统计为 opt-in，在 Settings 中启用
- Daemon 大约每分钟自动上传待同步事件
- Worker 使用预计算快照，不在公开请求中实时扫表
- 汇总按 `ticket_id` 最后一条事件计算，避免多阶段重复计数
- 详见 [cloudflare/stats-worker/README.md](../cloudflare/stats-worker/README.md)

## 后续方向

- 内部平台真实返回样例映射
- 更强的日志与事件流
- Windows 本地通信兼容
- 配置权限与审计
