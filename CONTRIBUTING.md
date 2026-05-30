# 贡献指南

本文档面向希望为码到贡献代码的开发者，重点说明如何接入更多服务商，以及如何保证改动能通过现有构建与发布链路。

## 授权与品牌

提交贡献即表示你同意贡献内容按本仓库的 [GNU Affero General Public License v3.0 only](LICENSE) 授权，并作为 MaDao 项目的一部分分发。贡献代码不授予 `MaDao` / `码到` 名称、Logo、官方发布渠道或其他项目标识的使用权，品牌使用需遵守 [Trademark Policy](TRADEMARKS.md)。

## 架构概览

接入链路分为 3 层：

| 层 | 职责 |
|----|------|
| `crates/plugin-sdk` | 定义 `ProviderManifest`、`ProviderKind` 以及各协议配置结构 |
| `crates/sms-core` | 定义统一 `SmsProvider` trait，在 `build_provider()` 中把 manifest 构造成具体 provider |
| `crates/sms-server` | 把统一 provider 能力暴露为 HTTP API |

补充背景见 [docs/architecture.md](docs/architecture.md)。

## 两种贡献路径

### 路径一：已有协议下新增服务商

如果目标平台兼容 `handler_api` 或 `five_sim` 协议，通常不需要新增 Rust 类型，只需新增或调整 manifest：

1. 在 `plugins/providers/` 新增一个 `.toml` 文件
2. 填写 `id / name / kind / defaults`
3. 配置对应的 `handler_api` 或 `five_sim` 段
4. 根据真实响应补齐 `service_aliases`、`JSON pointer`、`status token`
5. 如有展示或行为差异，补充 `[ui]` / `[behavior]`
6. 如需复用协议内现有实现分支，补充 profile（如 `handler_api.profile = "smsbower"`）
7. 用本地 API 冒烟验证

参考示例：

- [`plugins/providers/herosms.toml`](plugins/providers/herosms.toml)
- [`plugins/providers/smsbower.toml`](plugins/providers/smsbower.toml)
- [`plugins/providers/fivesim.toml`](plugins/providers/fivesim.toml)

### 路径二：新增一种协议适配器

如果目标平台不兼容现有协议，需要新增 provider kind：

1. 在 [`crates/plugin-sdk/src/lib.rs`](crates/plugin-sdk/src/lib.rs) 中扩展 `ProviderKind`
2. 为新协议添加配置结构，挂到 `ProviderManifest`
3. 在 [`crates/sms-core/src/provider.rs`](crates/sms-core/src/provider.rs) 中实现新的 `SmsProvider`
4. 在 `build_provider()` 中注册构造逻辑
5. 根据需要扩展 `options`、错误归一化和测试
6. 提供对应 manifest 模板

`SmsProvider` 需要覆盖的统一能力：

- `acquire` / `poll_code` / `release`
- `get_balance` / `get_prices`
- `list_countries` / `list_services` / `list_operators`

## Manifest 设计要求

新增服务商时，manifest 至少要保证：

- `id` 稳定且唯一
- `kind` 与配置段匹配
- `defaults.service / defaults.country` 可用
- `enabled` 默认值明确
- `priority` 可参与排序
- 敏感字段（如 `api_key`）不提交真实值

如果希望减少 app 本体改动，优先把 provider-specific 差异写进 manifest：

| 配置段 | 字段 |
|--------|------|
| `[ui]` | `protocol_label`、`icon_url`、`badge_label` |
| `[behavior]` | `cancel_cooldown_sec` |

**`handler_api` 风格重点字段：**

`profile`、`balance_prefix`、`success_status_prefix`、`wait_status_tokens`、`failure_status_tokens`、`id_json_pointers`、`phone_json_pointers`、`price_json_pointers`、`code_json_pointers`

**`five_sim` 风格重点字段：**

`products_endpoint`、`buy_endpoint_prefix`、`check_endpoint_prefix`、`balance_json_pointer`、`status_json_pointer`、`failure_statuses`

## 建议的开发流程

1. 先补真实响应样例，确认协议归类
2. 优先尝试”纯 manifest 适配”
3. 不够用时再加新的 Rust 适配器
4. 写测试覆盖公共行为和异常路径
5. 用 daemon API 做一次端到端冒烟

## 测试要求

提交前至少执行：

```bash
cargo test -p sms-core
cargo check --workspace
npm run build
```

如果新增了服务商协议，建议补充以下测试：

- 余额解析 / 号码获取解析 / 状态轮询解析
- 价格列表解析 / 上游错误归一化
- Manifest 保存 / reload 后仍可工作

## 如何验证 API 联动

项目后端提供统一 HTTP API，接入新服务商后可直接调用验证：

| 接口 | 用途 |
|------|------|
| `GET /api/providers` | 查看运行态 provider 列表 |
| `GET /api/providers/{id}/manifest` | 读取 manifest |
| `PUT /api/providers/{id}/manifest` | 更新 manifest |
| `POST /api/acquire` | 发起激活 |
| `POST /api/poll` | 轮询验证码 |
| `POST /api/release` | 结束 / 取消订单 |

详细联动方式见 [docs/api-integration.md](docs/api-integration.md) 和 [docs/daemon-api.md](docs/daemon-api.md)。

## OpenAPI 同步约束

如果修改了 daemon HTTP API，必须同步维护 OpenAPI：

- 路由定义：`crates/sms-server/src/lib.rs`
- OpenAPI 规范：`docs/openapi/daemon.openapi.yaml`
- Swagger UI 静态页：`docs/openapi/index.html`

规则：

1. 新增、删除、重命名任何 `.route(...)` 路径时，同步更新 OpenAPI 规范
2. 修改请求 / 响应 JSON 结构时，同步更新对应 schema
3. 实现与文档不一致时，以代码真实行为为准，先修规范再决定是否修代码
4. 提交前执行 `npm run check:openapi-sync`

仓库通过 `scripts/check-openapi-sync.mjs` 做最小同步检查，避免文档漂移。

## 发布与二进制产物

仓库包含 GitHub Actions 自动发布工作流，覆盖 macOS、Linux、Windows 三平台。自动构建桌面二进制并上传到 GitHub Release。具体见 `.github/workflows/release.yml`。
