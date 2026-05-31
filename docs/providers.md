# Provider 协议兼容说明

## 目标

本项目支持团队内部、自建平台的协议兼容，而不是绑定某个固定第三方实现。

当前兼容三类协议风格：

| 协议 | 说明 |
|------|------|
| HeroSMS | 独立适配器（兼容层 + 扩展） |
| SmsBower | 独立适配器（兼容层 + 扩展） |
| 5SIM | REST 风格 |

## API 详细文档

| Provider | 文档 |
|----------|------|
| HeroSMS | [providers/herosms.md](providers/herosms.md) |
| SmsBower | [providers/smsbower.md](providers/smsbower.md) |
| 5SIM REST API | [providers/5sim.md](providers/5sim.md) |
| handler_api 共性参考 | [providers/handler-api.md](providers/handler-api.md) |
| 返回值校验完善计划 | [providers/provider-validation-plan.md](providers/provider-validation-plan.md) |
| Mock（本地联调） | [providers/mock.md](providers/mock.md) |

## Provider Manifest

Manifest 模板位于 `plugins/providers/*.toml`。桌面端与 daemon 首次运行时会将模板复制到用户配置目录下的 `providers/`，后续读写都发生在用户目录副本中。

内置模板：`mock.toml`、`herosms.toml`、`smsbower.toml`、`fivesim.toml`

Manifest 除了协议字段外，也承载少量展示与行为配置：

| 配置段 | 字段 |
|--------|------|
| `[ui]` | `protocol_label`、`icon_url`、`badge_label` |
| `[behavior]` | `cancel_cooldown_sec` |

目标是减少 app 本体对具体 provider id 的硬编码，让同协议下新增 provider 尽量只靠 manifest 完成接入。

## `handler_api` 风格

适用于 `sms-activate / handler_api` 风格平台。当前项目不再把 HeroSMS 与 SmsBower 视作同一个协议实现，而是各自独立适配器，底层只共享少量工具与兼容逻辑。

关键字段：`base_url`、`api_key`、`get_balance_action`、`get_prices_action`、`get_countries_action`、`get_number_action`、`get_status_action`、`set_status_action`

协议解析字段：`balance_prefix`、`success_status_prefix`、`wait_status_tokens`、`failure_status_tokens`、`id_json_pointers`、`phone_json_pointers`、`price_json_pointers`、`balance_json_pointers`、`code_json_pointers`

这些字段的意义是：即使内部平台的 JSON 结构或文本前缀和公开服务不同，只要协议语义一致，就可以通过配置适配。

Profile 选择：

- `handler_api.profile = "standard"` — 标准路径
- `handler_api.profile = "smsbower"` — 复用 SmsBower 扩展实现

## `five_sim` 风格

适用于 5SIM 风格 REST 平台。

关键字段：`base_url`、`api_key`、`profile_endpoint`、`prices_endpoint`、`buy_endpoint_prefix`、`check_endpoint_prefix`、`finish_action`、`cancel_action`、`ban_action`

协议解析字段：`balance_json_pointer`、`status_json_pointer`、`code_json_pointers`、`failure_statuses`、`id_json_pointers`、`phone_json_pointers`、`price_json_pointers`

## 统一能力

无论 provider 属于哪种协议风格，都会统一到以下能力（由 `SmsProvider` trait 定义）：

- `acquire` / `poll` / `release`
- `get_balance` / `get_prices`

## 如何对接内部平台

如果平台兼容上述协议之一，通常只需要：

1. 调整对应 TOML 的 `base_url`
2. 填入认证信息
3. 按真实返回格式修改 JSON pointer / status token
4. 如有展示或行为差异，补充 `[ui]` / `[behavior]`
