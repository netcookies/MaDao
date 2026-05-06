# Routing Plans

## 目标

`Routing Plans` 用来替代当前“按 provider 排序即自动路由”的旧语义。

新的主路由模型是：

1. 先创建一个**命名取码方案**，例如 `OpenGPT Plan 1`
2. 该方案绑定一个 `service`
3. 方案内有多条候选项，每条候选项对应：
   - `provider`
   - `country`
   - `operator`
   - `price mode`
4. 执行策略为：
   - `sequential`
   - `random`

## 数据模型

每个 `RoutingPlan` 包含：

- `id`
- `name`
- `service`
- `enabled`
- `execution_mode`
- `items[]`

补充说明：

- `id` 由系统生成随机值，用作稳定引用
- `name` 由用户维护，用于界面展示和业务识别

每个 `RoutingPlanItem` 包含：

- `id`
- `provider`
- `country`
- `operator`
- `enabled`
- `price_mode`
- `min_price`
- `max_price`
- `fixed_price`

## HTTP API

### 1. 查询方案列表

```http
GET /api/routing-plans
```

### 2. 保存方案

```http
POST /api/routing-plans
Content-Type: application/json
```

请求体为一个完整 `RoutingPlan`。

约束：

- `name` 不能为空
- `service` 不能为空
- 必须至少包含 1 条候选项
- 如果 plan 为 `enabled = true`，则至少要有 1 条 `enabled` 的候选项

### 3. 查询单个方案

```http
GET /api/routing-plans/{plan_id}
```

### 4. 删除方案

```http
DELETE /api/routing-plans/{plan_id}
```

### 5. 按方案发起取码

```http
POST /api/acquire
Content-Type: application/json
```

最小请求体：

```json
{
  "provider": "auto",
  "routing_plan_id": "openai-plan"
}
```

注意：

- 被禁用的 routing plan 不能用于发起 acquire

## Failover 语义

如果调用方判断当前命中的方案项无法继续使用，可以回调：

```http
POST /api/routing/failover
Content-Type: application/json
```

请求体：

```json
{
  "ticket_id": "xxx",
  "failed_item_id": "mock-first",
  "reason": "upstream reject"
}
```

服务端会按该方案的 `execution_mode` 继续尝试下一项；如果候选项耗尽，则返回 routing failure。

## 价格选择支持边界

当前实现支持三种价格模式：

- `any`
- `range`
- `fixed`

但需要注意：

1. 当前统一 provider 抽象稳定支持的是 `min_price / max_price` 过滤。
2. 当前系统**没有统一的 provider-specific 价格行 ID 锁定下单能力**。
3. 因此 `fixed` 的实际行为是把选中的价格值转换成 `min_price == max_price` 的近似过滤。

这意味着：

- 如果上游 provider 本身支持按价格区间筛选，则当前实现可工作。
- 如果未来某个 provider 暴露“精确价格条目 ID 下单”，才适合升级成真正严格的 fixed-price reservation。

## 需要弃用的旧行为

以下旧行为不再应被视为主路由入口：

1. `Providers` 页面通过拖拽排序表达对外路由优先级
2. `Settings` 页面里的全局 `routing_strategy` 作为主要用户路由配置
3. `SmsService::acquire_code_auto` 仅按 provider priority 的单一自动路由语义

这些旧行为不再是产品主入口，前端应以 `Routing Plans` 作为唯一主配置界面。
