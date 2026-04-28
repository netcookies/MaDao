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

## getNumberV2 — JSON 响应版（SmsBower 专用）

```
GET ?action=getNumberV2&api_key=XXX&service=XXX&country=XXX[&可选参数]
```

参数与 `getNumber` 完全相同，仅 `action` 不同。

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
| `canGetAnotherSms` | `boolean` | `boolean`、`1`、`"1"` | 本项目未使用此字段 |

> **注意**：`phoneNumber` 在某些实现中会含 `*` 掩码字符（如 `79584***456`），无法转换为数字，必须视为字符串处理。本项目通过 `coerce_str_value` 同时兼容 integer 和 string 格式。

本项目通过 `id_json_pointers`、`phone_json_pointers`、`price_json_pointers` 配置提取各字段。

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

本项目当前未调用此端点（国家通过 TOML 配置固定传入）。

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

# Action 名称（HeroSMS 使用 getNumber，SmsBower 使用 getNumberV2）
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
wait_status_tokens      = ["STATUS_WAIT_CODE"]   # 仅文档用，当前轮询逻辑以 catch-all 处理等待
failure_status_tokens   = ["STATUS_CANCEL", "BAD_STATUS", "NO_ACTIVATION", "BAD_KEY", "BAD_SERVICE"]

# JSON 响应解析（用于 getNumberV2）
id_json_pointers        = ["/activationId", "/activation_id", "/id"]
phone_json_pointers     = ["/phoneNumber", "/phone", "/number"]
price_json_pointers     = ["/activationCost", "/price"]
balance_json_pointers   = ["/balance", "/amount", "/data/balance", "/data/amount"]
code_json_pointers      = ["/sms/code", "/code", "/data/code", "/sms/0/code"]
```

> `wait_status_tokens` 当前在代码中**未被读取**（轮询逻辑以"既不成功也不失败即为等待"的方式处理），保留该字段主要用于文档说明和未来扩展。
