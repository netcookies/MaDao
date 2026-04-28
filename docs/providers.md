# Provider Protocol Compatibility

## 目标

本项目支持的是团队内部、自建平台的协议兼容，而不是绑定某个固定第三方实现。

当前兼容三类协议风格：

- `HeroSMS` 风格 `handler_api`
- `SmsBower` 风格 `handler_api`
- `5SIM` 风格 REST

## Provider Manifest

provider manifests 位于：

```text
plugins/providers/*.toml
```

当前内置：

- `mock.toml`
- `herosms.toml`
- `smsbower.toml`
- `fivesim.toml`

## `handler_api` 风格

适用于 `HeroSMS / SmsBower` 风格平台。

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

## 当前统一能力

无论 provider 属于哪种协议风格，都会统一到以下能力：

- `acquire`
- `poll`
- `release`
- `get_balance`
- `get_prices`

这套统一能力由 [crates/sms-core/src/provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs) 中的 `SmsProvider` trait 定义。

## 如何对接你们内部平台

如果你们平台已经兼容这三种协议之一，通常只需要：

1. 调整对应 `TOML` 的 `base_url`
2. 填入认证信息
3. 按真实返回格式修改 `JSON pointer / status token`

如果你提供真实样例，我可以进一步把默认 manifest 调整到你们平台的实际值。
