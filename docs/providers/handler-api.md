# handler_api Provider API Reference

本协议由 sms-activate.org 制定，被 HeroSMS、SmsBower 等多家服务商兼容实现。

官方文档参考：
- SmsBower：https://smsbower.com/api/?page=client
- HeroSMS：https://hero-sms.com/api
- sms-activate（协议基准）：https://sms-activate.io/api2

---

## 基础信息

| 平台 | 端点 URL |
|------|----------|
| SmsBower | `https://smsbower.page/stubs/handler_api.php` |
| HeroSMS | `https://hero-sms.com/stubs/handler_api.php` |

所有请求使用 HTTP GET，认证通过 `api_key` query 参数传递。

说明：

- `HeroSMS` 官方 API 页是 `https://hero-sms.com/api#tag/sms-activate`，但页面是前端渲染文档，纯 HTML 抓取不易直接抽出完整 OpenAPI 文本。
- `SmsBower` 官方文档页明确列出了 `getServicesList`、`getCountries`、`getNumberV2`、`getPricesV2`、`getPricesV3` 等扩展能力。
- 本文件会将“协议共性”和“SmsBower 扩展能力”分开写，避免误认为 HeroSMS 一定支持全部扩展。

---

## getBalance — 查询余额

```
GET ?action=getBalance&api_key=XXX
```

### 成功响应（纯文本）

```
ACCESS_BALANCE:12.50
```

冒号后的值为浮点数字符串，本项目通过 `balance_prefix = "ACCESS_BALANCE:"` 解析。

### 错误响应

| 响应字符串 | 含义 |
|-----------|------|
| `BAD_KEY` | API Key 无效 |
| `ERROR_SQL` | 服务端数据库错误 |

---

## getNumber — 标准协议获取号码（HeroSMS 使用）

```
GET ?action=getNumber&api_key=XXX&service=XXX&country=XXX[&可选参数]
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `service` | `string` | 是 | 服务代码，如 `tg`、`vk`、`dr` |
| `country` | `int` | 是 | 国家 ID（数字，`0` 通常表示俄罗斯） |
| `maxPrice` | `float` | 否 | 最高可接受价格 |
| `minPrice` | `float` | 否 | 最低价格（SmsBower 扩展） |
| `operator` | `string` | 否 | 运营商名，多个以逗号分隔 |
| `phoneException` | `string` | 否 | 排除的号码前缀（逗号分隔） |

### 成功响应（纯文本）

```
ACCESS_NUMBER:{activationId}:{phoneNumber}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `activationId` | string（整数内容） | 激活 ID，本项目存入 `ticket.upstream_id` |
| `phoneNumber` | string（数字，无 `+`） | 号码含国家码，如 `79129001234` |

本项目会自动为 `phoneNumber` 添加 `+` 前缀（规范化为 E.164 格式）。

### 错误响应

| 响应字符串 | 含义 |
|-----------|------|
| `NO_NUMBERS` | 当前无可用号码 |
| `NO_BALANCE` | 余额不足 |
| `BAD_SERVICE` | 服务代码不存在 |
| `BAD_COUNTRY` | 国家代码无效 |
| `BAD_KEY` | API Key 无效 |
| `BAD_ACTION` | action 参数错误 |

---

## getNumberV2 — JSON 响应版（当前项目：SmsBower / HeroSMS）

```
GET ?action=getNumberV2&api_key=XXX&service=XXX&country=XXX[&可选参数]
```

参数与 `getNumber` 完全相同，仅 `action` 不同。

说明：

- `SmsBower` 官方文档明确列出 `getNumberV2`
- `HeroSMS` OpenAPI 也定义了 `getNumberV2`
- 当前项目已让 `SmsBower` 与 `HeroSMS` 都默认使用 `getNumberV2`

### 成功响应（JSON）

```json
{
  "activationId":       "123456",
  "phoneNumber":        79584123456,
  "activationCost":     2.40,
  "countryCode":        2,
  "canGetAnotherSms":   true,
  "activationTime":     "2025-07-26 13:50:08",
  "activationOperator": "mtt"
}
```

### 字段类型（各平台实现存在差异，需防御性处理）

| 字段 | 文档标注类型 | 实际可能出现的类型 | 本项目处理方式 |
|------|------------|-----------------|-------------|
| `activationId` | `string` | `string` 或 `integer` | `coerce_str_value`（两者均兼容） |
| `phoneNumber` | `number (int)` | `integer` 或含 `*` 掩码的 `string` | `coerce_str_value` → 按 string 处理 |
| `activationCost` | `float` | `float` 或 `"2.40"` 字符串 | `coerce_f64`（两者均兼容） |
| `countryCode` | `number` | `number` 或 `string` | 本项目未使用此字段 |
| `canGetAnotherSms` | `boolean` | `boolean`、`1`、`"1"` | 当前项目用于 `same_activation_retry` 可用性判断 |

> **注意**：`phoneNumber` 在某些实现中会含 `*` 掩码字符（如 `79584***456`），无法转换为数字，必须视为字符串处理。本项目通过 `coerce_str_value` 同时兼容 integer 和 string 格式。

本项目通过 `id_json_pointers`、`phone_json_pointers`、`price_json_pointers` 配置提取各字段。
`activationEndTime` 当前也会被读取，用于 `same_activation_retry` 的过期时间判断。

### 错误响应（同 getNumber）

---

## getStatus — 查询激活状态

```
GET ?action=getStatus&api_key=XXX&id=XXX
```

### 响应字符串完整枚举

| 响应字符串 | 含义 | 本项目处理 |
|-----------|------|-----------|
| `STATUS_OK:{code}` | 已收到验证码，`{code}` 为验证码内容 | → `CodeReceived` |
| `STATUS_WAIT_CODE` | 等待 SMS，尚未收到 | → `WaitingCode` |
| `STATUS_WAIT_RETRY:{lastCode}` | 等待新 SMS，上一次的码附在冒号后 | → `WaitingCode`（忽略上次码） |
| `STATUS_WAIT_RESEND` | 等待重发（部分平台实现） | → `WaitingCode` |
| `STATUS_CANCEL` | 激活已取消 | → `Failed` |
| `NO_ACTIVATION` | 激活 ID 不存在或已过期 | → `Failed` |
| `BAD_KEY` | API Key 无效 | → `Failed` |
| `BAD_SERVICE` | 服务代码错误 | → `Failed` |
| `BAD_ACTION` | action 参数错误 | → `Failed` |
| `BAD_STATUS` | 请求的 status 值不合法 | → `Failed` |

本项目通过 `success_status_prefix = "STATUS_OK:"` 和 `failure_status_tokens` 区分状态。

`STATUS_WAIT_RETRY` 中附带的上一次验证码目前不被提取（视为普通等待状态）。
`wait_status_tokens` 会显式控制哪些返回值属于等待态；未匹配 success / failure / wait 的未知响应会被视为失败，避免无限轮询掩盖真实错误。

---

## setStatus — 变更激活状态（释放号码）

```
GET ?action=setStatus&api_key=XXX&id=XXX&status=XXX
```

### 状态码枚举

| `status` 值 | 操作 | 成功响应 | 本项目映射 |
|------------|------|---------|-----------|
| `1` | 通知服务端 SMS 已发出，号码已就绪 | `ACCESS_READY` | 本项目未使用 |
| `3` | 请求重发（重新获取验证码，免费） | `ACCESS_RETRY_GET` | `ReleaseAction::Retry` |
| `6` | 完成激活（使用成功，扣费） | `ACCESS_ACTIVATION` | `ReleaseAction::Finish` |
| `8` | 取消激活（放弃，退款） | `ACCESS_CANCEL` | `ReleaseAction::Cancel` / `Ban` |

### 错误响应

| 响应字符串 | 含义 |
|-----------|------|
| `NO_ACTIVATION` | 激活 ID 不存在 |
| `BAD_STATUS` | 状态码不合法（如在已完成的订单上再次操作） |
| `BAD_KEY` | API Key 无效 |
| `EARLY_CANCEL_DENIED` | 购买后 2 分钟内不允许取消（status=8）|

> `EARLY_CANCEL_DENIED` 会被本项目作为 `SmsError::Upstream` 返回，调用方需处理此情况（等待 2 分钟后重试取消）。

---

## getPrices — 获取价格列表

```
GET ?action=getPrices&api_key=XXX[&service=XXX][&country=XXX]
```

### 响应 JSON 结构

外层键为**国家 ID**（字符串格式的整数），内层键为**服务代码**：

```json
{
  "0": {
    "tg": { "cost": 2.50, "count": 1240 },
    "vk": { "cost": 1.20, "count":  830 }
  },
  "2": {
    "tg": { "cost": 4.00, "count":  560 }
  }
}
```

| 字段 | JSON 类型 | 说明 |
|------|-----------|------|
| 外层键（国家） | `string`（数字内容） | 国家 ID，如 `"0"` |
| 内层键（服务） | `string` | 服务代码，如 `"tg"` |
| `cost` | `number (float)` | 单次激活费用（部分实现返回字符串，本项目已兼容） |
| `count` | `number (int)` | 可用号码数量 |

本项目 `parse_prices` 的处理逻辑：先取 `entry[service]`（服务过滤），若不存在则回退到 `entry` 本身（适配返回全量结构的平台）。

---

## getCountries — 获取国家列表

```
GET ?action=getCountries&api_key=XXX
```

### 响应 JSON（SmsBower 格式）

```json
[
  {
    "id":  1003,
    "rus": "Россия",
    "eng": "Russia",
    "chn": "俄罗斯"
  }
]
```

当前实现**已经调用**此端点来构建动态国家选项，见 `request_countries()`：

- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:195)

兼容性说明：

- `SmsBower` 文档页展示的是富结构国家对象，包含 `title / iso / prefix / operators / alternative_params`
- 当前代码只读取 `id / chn / eng / rus`
- 如果后续要支持更细粒度的 operator 级联，现有解析需要扩展

---

## SmsBower vs HeroSMS 差异对比

| 特性 | SmsBower | HeroSMS |
|------|---------|---------|
| `getNumber` | 支持 | 支持（默认） |
| `getNumberV2`（JSON 响应） | **支持** | 文档未列出 |
| `getPricesV2` / `V3` | 支持 | 不支持 |
| `minPrice` 参数 | 支持 | 不支持 |
| Webhook 通知 | 支持（IP: `167.235.198.205`） | 不支持 |
| 协议基础 | handler_api 兼容 | handler_api 兼容 |

另外两个与当前实现直接相关的差异：

| 特性 | SmsBower | HeroSMS |
|------|---------|---------|
| `getServicesList` | 文档明确列出 | 页面未直接确认 |
| `getCountries` | 文档明确列出，且返回富结构国家数据 | 运行时可调用，但公开页面不易直接提取结构 |

---

## 全局错误码汇总

| 错误字符串 | 可能出现的 action |
|-----------|----------------|
| `BAD_KEY` | 全部 |
| `BAD_ACTION` | 全部 |
| `BAD_SERVICE` | getNumber, getPrices |
| `BAD_COUNTRY` | getNumber |
| `BAD_STATUS` | setStatus, getStatus |
| `NO_ACTIVATION` | getStatus, setStatus |
| `NO_BALANCE` | getNumber |
| `NO_NUMBERS` | getNumber |
| `ERROR_SQL` | getBalance |
| `EARLY_CANCEL_DENIED` | setStatus（status=8，2 分钟内） |

---

## 本项目 TOML 配置对照

```toml
# plugins/providers/smsbower.toml（或 herosms.toml）

[handler_api]
base_url                = "https://smsbower.page/stubs/handler_api.php"
api_key                 = ""

# Action 名称（当前内置配置：HeroSMS 使用 `getNumber`，SmsBower 使用 `getNumberV2`）
get_balance_action      = "getBalance"
get_prices_action       = "getPrices"
get_countries_action    = "getCountries"
get_number_action       = "getNumberV2"   # HeroSMS 填 "getNumber"
get_status_action       = "getStatus"
set_status_action       = "setStatus"

# setStatus 数值映射
status_ready            = 1   # 未使用，保留兼容
status_retry            = 3   # ReleaseAction::Retry
status_finish           = 6   # ReleaseAction::Finish
status_cancel           = 8   # ReleaseAction::Cancel / Ban

# 文本响应解析
balance_prefix          = "ACCESS_BALANCE:"
success_status_prefix   = "STATUS_OK:"
wait_status_tokens      = ["STATUS_WAIT_CODE"]   # 当前代码实际会读取
failure_status_tokens   = ["STATUS_CANCEL", "BAD_STATUS", "NO_ACTIVATION", "BAD_KEY", "BAD_SERVICE"]

# JSON 响应解析（用于 getNumberV2）
id_json_pointers        = ["/activationId", "/activation_id", "/id"]
phone_json_pointers     = ["/phoneNumber", "/phone", "/number"]
price_json_pointers     = ["/activationCost", "/price"]
balance_json_pointers   = ["/balance", "/amount", "/data/balance", "/data/amount"]
code_json_pointers      = ["/sms/code", "/code", "/data/code", "/sms/0/code"]
```

> `wait_status_tokens` 当前代码**已经读取**，见 [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:448)。未知状态不会被静默当作等待，而是按失败处理。

---

## 当前实现范围

虽然 `SmsBower` 文档还列出了 `getPricesV2`、`getPricesV3` 等扩展接口，但当前代码实际使用范围只有：

- `getBalance`
- `getNumber` / `getNumberV2`
- `getStatus`
- `setStatus`
- `getPrices`
- `getCountries`
- `getServicesList` / `getServices`

对应实现入口：

- 国家列表：[provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:195)
- 服务列表：[provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:228)
- 价格解析：[provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:280)
- 号码获取：[provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:377)

---

## 当前校验缺口汇总

虽然 `handler_api` 的共性文档已经基本齐全，但当前实现还存在几个跨 `HeroSMS / SmsBower` 的共性缺口：

### 1. 等待态枚举不完整

当前默认 `wait_status_tokens` 只有：

- `STATUS_WAIT_CODE`

当前已确认的上游等待态是：

- `HeroSMS` OpenAPI：`STATUS_WAIT_RETRY:{lastCode}`、`STATUS_WAIT_RESEND`
- `SmsBower` 保存页：`STATUS_WAIT_RETRY:{lastCode}`

这意味着：

- `STATUS_WAIT_RETRY` 至少应纳入 `HeroSMS / SmsBower` 的等待态配置
- `STATUS_WAIT_RESEND` 当前可确认属于 `HeroSMS`，是否作为 `SmsBower` 共享默认值还需要更多文档或运行时样本佐证

参考：

- [plugin-sdk/src/lib.rs](/Users/isulewli/Projects/MaDao/crates/plugin-sdk/src/lib.rs:320)
- [plugins/providers/herosms.toml](/Users/isulewli/Projects/MaDao/plugins/providers/herosms.toml:43)
- [plugins/providers/smsbower.toml](/Users/isulewli/Projects/MaDao/plugins/providers/smsbower.toml:43)
- [API Documentation - SMSBower.html](</Users/isulewli/Downloads/API Documentation - SMSBower.html>)

### 2. `setStatus` 成功响应未做 action 级校验

当前 release 逻辑只要 HTTP 成功就直接返回文本，没有校验：

- `retry` 是否返回 `ACCESS_RETRY_GET`
- `finish` 是否返回 `ACCESS_ACTIVATION`
- `cancel` / `ban` 是否返回 `ACCESS_CANCEL`

这会导致“HTTP 200 但业务语义不符”的场景被误判为成功。

### 3. HTTP 错误体未结构化解析

`HeroSMS` 的 OpenAPI 已经使用 `BaseErrorResponse { title, details, info }`。当前实现还只是把错误 body 作为原始字符串上抛，导致上层无法稳定识别：

- `EARLY_CANCEL_DENIED`
- `FREE_CANCELLATION_EXPIRED`
- `OTP_RECEIVED`

### 4. 文档与配置需同步收敛

后续如果补齐上面的缺口，需要同步更新：

- `plugin-sdk` 默认值
- `herosms.toml`
- `smsbower.toml`
- provider 协议文档
