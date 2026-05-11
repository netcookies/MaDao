# Provider Protocol Compatibility

## 目标

本项目支持的是团队内部、自建平台的协议兼容，而不是绑定某个固定第三方实现。

当前兼容三类协议风格：

- `HeroSMS` 独立适配器（兼容层 + 扩展）
- `SmsBower` 独立适配器（兼容层 + 扩展）
- `5SIM` 风格 REST

## API 详细文档

每个 provider 的完整 API 参考（端点、字段类型、错误码、TOML 配置对照）：

| Provider | 文档 |
|----------|------|
| HeroSMS | [docs/providers/herosms.md](providers/herosms.md) |
| SmsBower | [docs/providers/smsbower.md](providers/smsbower.md) |
| 5SIM REST API | [docs/providers/5sim.md](providers/5sim.md) |
| handler_api 共性参考 | [docs/providers/handler-api.md](providers/handler-api.md) |
| 返回值校验完善计划 | [docs/providers/provider-validation-plan.md](providers/provider-validation-plan.md) |
| Mock（本地联调） | [docs/providers/mock.md](providers/mock.md) |

## Provider Manifest

provider manifest 模板位于：

```text
plugins/providers/*.toml
```

桌面端与 daemon 默认都会在首次运行时将这些模板复制到用户配置目录下的 `providers/`，后续实际读写都发生在用户目录副本中。

当前内置：

- `mock.toml`
- `herosms.toml`
- `smsbower.toml`
- `fivesim.toml`

除了协议字段外，manifest 现在也承载少量 provider-specific 的展示与行为配置，例如：

- `[ui]`
  - `protocol_label`
  - `icon_url`
  - `badge_label`
- `[behavior]`
  - `cancel_cooldown_sec`

这类字段的目标是减少 app 本体对具体 provider id 的硬编码，让同协议下新增 provider 尽量只靠 manifest 完成接入。

## `handler_api` 风格

适用于共性的 `sms-activate / handler_api` 风格平台。

但当前项目不再把 `HeroSMS` 与 `SmsBower` 完全视作同一个协议实现，而是：

- 各自独立适配器
- 底层只共享少量工具与兼容逻辑

关键字段：

- `base_url`
- `api_key`
- `get_balance_action`
- `get_prices_action`
- `get_countries_action`
- `get_number_action`
- `get_status_action`
- `set_status_action`

以及新增的协议解析字段：

- `balance_prefix`
- `success_status_prefix`
- `wait_status_tokens`
- `failure_status_tokens`
- `id_json_pointers`
- `phone_json_pointers`
- `price_json_pointers`
- `balance_json_pointers`
- `code_json_pointers`

这些字段的意义是：即使你们内部平台的 JSON 结构或文本前缀和公开服务不同，只要协议语义一致，就可以通过配置适配。

如果同样是 `handler_api`，但需要复用已有的实现分支差异，也可以通过 profile 选择：

- `handler_api.profile = "standard"`：标准 `handler_api` 路径
- `handler_api.profile = "smsbower"`：复用 `SmsBower` 扩展实现

## `five_sim` 风格

适用于 `5SIM` 风格 REST 平台。

关键字段：

- `base_url`
- `api_key`
- `profile_endpoint`
- `prices_endpoint`
- `buy_endpoint_prefix`
- `check_endpoint_prefix`
- `finish_action`
- `cancel_action`
- `ban_action`

以及新增的协议解析字段：

- `balance_json_pointer`
- `status_json_pointer`
- `code_json_pointers`
- `failure_statuses`
- `id_json_pointers`
- `phone_json_pointers`
- `price_json_pointers`

## 当前统一能力

无论 provider 属于哪种协议风格，都会统一到以下能力：

- `acquire`
- `poll`
- `release`
- `get_balance`
- `get_prices`

这套统一能力由 `crates/sms-core/src/provider.rs` 中的 `SmsProvider` trait 定义。

## 如何对接你们内部平台

如果你们平台已经兼容这三种协议之一，通常只需要：

1. 调整对应 `TOML` 的 `base_url`
2. 填入认证信息
3. 按真实返回格式修改 `JSON pointer / status token`
4. 如有展示或行为差异，补充 `[ui]` / `[behavior]`

如果你提供真实样例，我可以进一步把默认 manifest 调整到你们平台的实际值。
