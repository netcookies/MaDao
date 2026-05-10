# 贡献指南

本文档面向希望为 `码到` 贡献代码的开发者，重点说明如何接入更多服务商，以及如何保证改动能通过现有构建与发布链路。

## 先理解当前架构

接入链路分为 3 层：

1. `crates/plugin-sdk`
   定义 `ProviderManifest`、`ProviderKind` 以及各协议配置结构。
2. `crates/sms-core`
   定义统一 `SmsProvider` trait，并在 `build_provider()` 中把 manifest 构造成具体 provider。
3. `crates/sms-server`
   把统一 provider 能力暴露为 HTTP API。

补充背景见 [docs/architecture.md](docs/architecture.md)。

## 两种贡献路径

### 路径一：已有协议下新增服务商

如果目标平台已经兼容以下任一协议：

- `handler_api`
- `five_sim`

通常不需要新增 Rust 类型，只需要新增或调整 manifest：

1. 在 `plugins/providers/` 新增一个 `.toml`
2. 填写 `id / name / kind / defaults`
3. 配置对应的 `handler_api` 或 `five_sim` 段
4. 根据真实响应补齐 `service_aliases`、`JSON pointer`、`status token`
5. 用本地 API 冒烟验证

可直接参考：

- [plugins/providers/herosms.toml](/Users/isulewli/Projects/MaDao/plugins/providers/herosms.toml)
- [plugins/providers/smsbower.toml](/Users/isulewli/Projects/MaDao/plugins/providers/smsbower.toml)
- [plugins/providers/fivesim.toml](/Users/isulewli/Projects/MaDao/plugins/providers/fivesim.toml)

### 路径二：新增一种协议适配器

如果目标平台不兼容现有协议，需要新增一个新的 provider kind：

1. 在 [crates/plugin-sdk/src/lib.rs](/Users/isulewli/Projects/MaDao/crates/plugin-sdk/src/lib.rs) 中扩展 `ProviderKind`
2. 为新协议添加配置结构，并挂到 `ProviderManifest`
3. 在 [crates/sms-core/src/provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs) 中实现新的 `SmsProvider`
4. 在 `build_provider()` 中注册构造逻辑
5. 根据需要扩展 `options`、错误归一化和测试
6. 提供对应 manifest 模板

当前 `SmsProvider` 需要覆盖的统一能力有：

- `acquire`
- `poll_code`
- `release`
- `get_balance`
- `get_prices`
- `list_countries`
- `list_services`
- `list_operators`

## manifest 设计要求

新增服务商时，manifest 至少要保证：

- `id` 稳定且唯一
- `kind` 与配置段匹配
- `defaults.service / defaults.country` 可用
- `enabled` 默认值明确
- `priority` 可参与排序
- 敏感字段如 `api_key` 不提交真实值

如果是 `handler_api` 风格，重点确认：

- `balance_prefix`
- `success_status_prefix`
- `wait_status_tokens`
- `failure_status_tokens`
- `id_json_pointers`
- `phone_json_pointers`
- `price_json_pointers`
- `code_json_pointers`

如果是 `five_sim` 风格，重点确认：

- `products_endpoint`
- `buy_endpoint_prefix`
- `check_endpoint_prefix`
- `balance_json_pointer`
- `status_json_pointer`
- `failure_statuses`

## 建议的开发流程

1. 先补真实响应样例，确认协议归类。
2. 优先尝试“纯 manifest 适配”。
3. 不够用时再加新的 Rust 适配器。
4. 写测试覆盖公共行为和异常路径。
5. 用 daemon API 做一次端到端冒烟。

## 测试要求

提交前至少执行：

```bash
cargo test -p sms-core
cargo check --workspace
npm run build
```

如果新增了服务商协议，建议至少补这些测试：

- 余额解析
- 号码获取解析
- 状态轮询解析
- 价格列表解析
- 上游错误归一化
- manifest 保存 / reload 后仍可工作

## 如何验证 API 联动

本项目的 app / daemon 后端已经提供统一 HTTP API，你可以在接入新服务商后直接调用：

- `GET /api/providers`
- `GET /api/providers/{id}/manifest`
- `PUT /api/providers/{id}/manifest`
- `POST /api/acquire`
- `POST /api/poll`
- `POST /api/release`

详细联动方式见 [docs/api-integration.md](docs/api-integration.md) 和 [docs/daemon-api.md](docs/daemon-api.md)。

## 发布与二进制产物

仓库包含 GitHub Actions 自动发布工作流，支持：

- `macOS`
- `Linux`
- `Windows`

它会自动构建桌面二进制并上传到 GitHub Release。具体见 `.github/workflows/release.yml`。
