# Routing Plans

## 目标

Routing Plan 替代旧的”按 provider 排序即自动路由”语义，提供更灵活的取码方案管理。

核心模型：

1. 创建一个命名取码方案（如 `OpenGPT Plan 1`）
2. 方案绑定一个 `service`
3. 方案内包含多条候选项，每条指定 `provider`、`country`、`operator`、`price mode`
4. 执行策略：`sequential`（顺序）或 `random`（随机）
5. 执行轮数：`1` = 单轮，`2` = 两轮，`0` = 无限轮

## 数据模型

**RoutingPlan：**

| 字段 | 说明 |
|------|------|
| `id` | 系统生成的随机值，用作稳定引用 |
| `name` | 用户维护，用于界面展示和业务识别 |
| `service` | 绑定的服务 |
| `enabled` | 是否启用 |
| `execution_mode` | `sequential` 或 `random` |
| `execution_rounds` | 候选项耗尽后是否进入下一轮；`0` = 无限轮 |
| `items[]` | 候选项列表 |

**RoutingPlanItem：**

| 字段 | 说明 |
|------|------|
| `id` | 候选项 ID |
| `provider` / `country` / `operator` | 路由目标 |
| `enabled` | 是否启用 |
| `price_mode` | `any` / `range` / `fixed` |
| `min_price` / `max_price` / `fixed_price` | 价格约束 |

## HTTP API

### 方案管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/routing-plans` | 查询方案列表 |
| `POST` | `/api/routing-plans` | 保存方案 |
| `GET` | `/api/routing-plans/{plan_id}` | 查询单个方案 |
| `DELETE` | `/api/routing-plans/{plan_id}` | 删除方案 |

保存约束：`name` 和 `service` 不能为空，至少包含 1 条候选项，启用的 plan 至少要有 1 条启用的候选项。

### 按方案发起取码

```http
POST /api/acquire
Content-Type: application/json

{
  "provider": "auto",
  "routing_plan_id": "openai-plan"
}
```

被禁用的 routing plan 不能用于发起 acquire。

## Replace 与 Failover

### Replace — 换号并收口当前 ticket

```http
POST /api/routing/replace
```

```json
{
  “ticket_id”: “xxx”,
  “failed_item_id”: “mock-first”,
  “reason”: “sms timeout”,
  “release_action”: “cancel”
}
```

返回同时包含 `current_ticket_release`（当前 ticket 释放结果）和 `next_ticket`（下一条候选 ticket）。适用于不想手动拼接”先 failover 再 cancel/ban”两步流程的场景。

### Failover — 推进到下一条候选

```http
POST /api/routing/failover
```

```json
{
  “ticket_id”: “xxx”,
  “failed_item_id”: “mock-first”,
  “reason”: “upstream reject”
}
```

服务端按 `execution_mode` 继续尝试下一项。当前轮候选项耗尽且 `execution_rounds` 允许继续时进入下一轮，否则返回 routing failure。

说明：

- `random` 模式下每一轮都会基于稳定候选集生成该轮顺序
- `failover` 沿已记录的候选顺序和轮次继续推进，不会回退

## 价格模式

支持三种价格模式：`any`、`range`、`fixed`。

当前统一 provider 抽象稳定支持 `min_price / max_price` 过滤。`fixed` 的实际行为是把选中价格值转换成 `min_price == max_price` 的近似过滤。如果未来某个 provider 暴露”精确价格条目 ID 下单”能力，才适合升级成真正严格的 fixed-price reservation。

## 已弃用的旧行为

以下旧行为不再是产品主入口，前端应以 Routing Plans 作为唯一主配置界面：

- Providers 页面通过拖拽排序表达路由优先级
- Settings 页面的全局 `routing_strategy`
- `SmsService::acquire_code_auto` 仅按 provider priority 的单一自动路由
