# 5SIM Provider API Reference

官方文档：https://5sim.net/docs · https://docs.5sim.net

本文档基于官方 Swagger、Go 客户端（Fef0/go-5sim）、Python 客户端（ErikPelli/fivesim）三方交叉验证。

---

## 认证

所有 `/v1/user/*` 端点需要 Bearer Token：

```
Authorization: Bearer <JWT_TOKEN>
Accept: application/json
```

- Token 有效期约 **1 年**，到期需在账户设置中重新生成
- `/v1/guest/*` 端点**无需认证**（公开访问）
- 在 5SIM 账户设置 → "Get API key" → 选择 **5sim protocol**（非 Deprecated API1）

本项目配置：`five_sim.api_key`

---

## 端点一览

| 操作 | 方法 | 路径 |
|------|------|------|
| 购买号码 | `GET` | `/v1/user/buy/activation/{country}/{operator}/{product}` |
| 查询/等待短信 | `GET` | `/v1/user/check/{id}` |
| 完成订单 | `GET` | `/v1/user/finish/{id}` |
| 取消订单 | `GET` | `/v1/user/cancel/{id}` |
| 封禁号码 | `GET` | `/v1/user/ban/{id}` |
| 用户资料/余额 | `GET` | `/v1/user/profile` |
| 访客价格 | `GET` | `/v1/guest/prices` |

---

## 购买号码

```
GET /v1/user/buy/activation/{country}/{operator}/{product}
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `country` | `string` | 国家名，如 `russia`、`england`、`any` |
| `operator` | `string` | 运营商名，如 `any`、`vodafone`、`beeline` |
| `product` | `string` | 服务名，如 `openai`、`telegram`、`facebook` |

### Query 参数（均可选）

| 参数 | 类型 | 说明 |
|------|------|------|
| `maxPrice` | `number` | 最高可接受价格，超过则不购买 |
| `reuse` | `string "1"` | 传 `"1"` 允许复用已用过的同一产品号码 |
| `forwarding` | `string "true"` | 开启来电转发 |
| `number` | `string` | 转发目标号码（11 位俄罗斯格式），仅 `forwarding=true` 时有效 |
| `voice` | `string "1"` | 传 `"1"` 支持语音验证码（非短信） |
| `ref` | `string` | 推荐码 |

本项目使用的参数：`maxPrice`（来自 `defaults.max_price`）、`reuse`（来自 `defaults.reuse_phone`）。

### 成功响应 `200 OK`

```json
{
  "id":               11631253,
  "phone":            "+447350690992",
  "operator":         "vodafone",
  "product":          "openai",
  "price":            21.0,
  "status":           "PENDING",
  "expires":          "2024-01-01T12:00:00Z",
  "sms":              null,
  "created_at":       "2024-01-01T11:45:00Z",
  "forwarding":       false,
  "forwarding_number": "",
  "country":          "england"
}
```

| 字段 | JSON 类型 | 说明 |
|------|-----------|------|
| `id` | `number (int)` | 订单 ID，本项目存入 `ticket.upstream_id` |
| `phone` | `string` | 虚拟号码，**含 `+` 前缀**（E.164 格式） |
| `price` | `number (float32)` | 本次费用，单位为账户货币 |
| `status` | `string` | 见下方状态枚举，购买时固定为 `"PENDING"` |
| `sms` | `null \| []SMS` | 初始为 `null`，收到短信后为 SMS 数组 |
| `expires` | `string (ISO 8601)` | 订单过期时间（通常 5 分钟） |

### 特殊：HTTP 200 纯文本错误

当无可用号码时，响应 **HTTP 200** 但 body 为纯文本：

```
no free phones
```

> 本项目 `request_get` 已处理此情况，会以原文作为 `SmsError::Upstream` 返回，不会报 "invalid json"。

### 错误响应（4xx，`text/plain`）

```
not enough user balance
not enough rating
bad country
bad operator
no product
server offline
```

---

## 查询订单 / 等待短信

```
GET /v1/user/check/{id}
```

响应结构与购买接口相同。关键差异：

- `status` 会从 `"PENDING"` 变为 `"RECEIVED"`（短信到达时）
- `sms` 数组从 `null` 变为非空数组

### SMS 对象结构

```json
{
  "id":         987654,
  "created_at": "2024-01-01T11:50:00Z",
  "date":       "2024-01-01T11:49:55Z",
  "sender":     "OpenAI",
  "text":       "Your OpenAI verification code is 123456",
  "code":       "123456"
}
```

| 字段 | JSON 类型 | 说明 |
|------|-----------|------|
| `id` | `number (int)` | 短信记录 ID |
| `sender` | `string` | 发送方名称或号码 |
| `text` | `string` | 短信完整原文 |
| `code` | **`string`** | 提取出的验证码（内容虽是数字，类型始终为 string） |

本项目通过 `code_json_pointers = ["/sms/0/code", ...]` 提取验证码。

### 订单 status 枚举

| 值 | 含义 |
|----|------|
| `PENDING` | 订单创建，等待短信到达 |
| `RECEIVED` | 短信已接收（`sms` 数组非空） |
| `FINISHED` | 用户已调用 `/finish`，订单完成 |
| `CANCELED` | 用户已调用 `/cancel`，订单取消 |
| `TIMEOUT` | 5 分钟内未收到短信，自动超时 |
| `BANNED` | 号码被标记为无效 |

本项目 `failure_statuses = ["CANCELED", "BANNED", "TIMEOUT"]`。

另外，内部兼容实现如果顶层字段名不是官方默认值，还可以通过以下 TOML 字段改写提取路径：

- `id_json_pointers`
- `phone_json_pointers`
- `price_json_pointers`

---

## 完成 / 取消 / 封禁

三个端点均返回完整订单对象（结构同上），区别仅在 `status` 字段值。

```
GET /v1/user/finish/{id}  → status: "FINISHED"
GET /v1/user/cancel/{id}  → status: "CANCELED"
GET /v1/user/ban/{id}     → status: "BANNED"
```

> 本项目的统一 `ReleaseAction::Retry` **不会** 映射到 5SIM 的 `cancel`。5SIM 协议本身没有安全的“重试释放”语义，调用方应继续轮询或重新创建订单。

错误响应（`404 Not Found`，`text/plain`）：
```
order not found
```

本项目 `finish_action`、`cancel_action`、`ban_action` 均可在 `fivesim.toml` 中配置。

---

## 用户资料（余额）

```
GET /v1/user/profile
```

### 响应

```json
{
  "id":                       1,
  "email":                    "user@example.com",
  "vendor":                   "",
  "default_forwarding_number": "",
  "balance":                  100.50,
  "rating":                   96.0,
  "frozen_balance":           0.0,
  "default_country": {
    "name":   "england",
    "iso":    "gb",
    "prefix": "+44"
  },
  "default_operator": {
    "name": ""
  }
}
```

| 字段 | JSON 类型 | 说明 |
|------|-----------|------|
| `balance` | `number (float)` | 账户可用余额，直接位于顶层 |
| `rating` | `number (float)` | 账户评分（0–100），频繁取消会降低 |

本项目通过 `balance_json_pointer = "/balance"` 提取余额。

---

## 访客价格

```
GET /v1/guest/prices
```

### Query 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `product` | `string` | 按产品名过滤（推荐，否则返回全量数据量极大） |
| `country` | `string` | 按国家名过滤 |

### 响应结构（重要：根据参数变化）

**仅传 `?product=openai`（本项目使用此方式）：**

```json
{
  "openai": {
    "russia": {
      "any":      { "cost": 10.0, "count": 1500, "rate": 99.2 },
      "beeline":  { "cost": 12.0, "count":  320, "rate": 98.5 }
    },
    "england": {
      "vodafone": { "cost": 21.0, "count":  133, "rate": 99.9 }
    }
  }
}
```

结构为 `{ product → country → operator → {cost, count, rate} }`。

**不传参数 / 仅传 `?country=england`：**

结构变为 `{ country → product → operator → {cost, count, rate} }`，**与上方相反**。

> 本项目 `get_prices` 固定使用 `?product=<service>` 查询，响应第一层是产品名，代码中 `json.get(&service)` 取出产品子树后按国家迭代——此路径是正确的。

### 价格层级字段

| 字段 | JSON 类型 | 说明 |
|------|-----------|------|
| `cost` | `number (float)` | 购买价格 |
| `count` | `number (int)` | 可用号码数量，`0` 表示暂无 |
| `rate` | `number (float)` | 历史成功率百分比（部分条目可能缺失） |

---

## Rate Limit

| 维度 | 限制 | HTTP 状态码 |
|------|------|------------|
| 按 IP | 100 请求/秒 | `503` |
| 按 API Key | 100 请求/秒 | `429` |
| 违规惩罚 | 10 分钟内触发 5 次限流 → 封禁 | — |

---

## 本项目 TOML 配置对照

```toml
# plugins/providers/fivesim.toml

[five_sim]
base_url               = "https://5sim.net/v1"
api_key                = ""                        # Bearer token
buy_operator           = "any"                     # 路径参数 operator
profile_endpoint       = "user/profile"            # GET /v1/user/profile
prices_endpoint        = "guest/prices"            # GET /v1/guest/prices?product=...
buy_endpoint_prefix    = "user/buy/activation"     # GET /v1/user/buy/activation/{country}/{op}/{product}
check_endpoint_prefix  = "user/check"              # GET /v1/user/check/{id}
finish_action          = "finish"                  # GET /v1/user/finish/{id}
cancel_action          = "cancel"                  # GET /v1/user/cancel/{id}
ban_action             = "ban"                     # GET /v1/user/ban/{id}

# JSON Pointer 路径（基于官方响应结构）
balance_json_pointer   = "/balance"                # profile.balance
status_json_pointer    = "/status"                 # order.status
code_json_pointers     = ["/sms/0/code", "/sms/code", "/code", "/data/code"]

# 轮询时视为失败的 status 枚举值
failure_statuses       = ["CANCELED", "BANNED", "TIMEOUT"]
```
