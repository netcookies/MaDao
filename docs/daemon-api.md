# Daemon API

本文档描述当前 daemon 对外暴露的 HTTP API，供不使用 UI 的开发者直接调用。

基础地址：

```text
http://127.0.0.1:7822
```

---

## 现有核心接口

### Runtime

- `GET /health`
- `GET /api/providers`
- `GET /api/provider-manifests`
- `POST /api/provider-manifests/reload`
- `POST /api/providers/reorder`
- `GET /api/notifications`
- `GET /api/settings/runtime`
- `POST /api/settings/runtime`
- `GET /api/settings/option-cache`

### Activation

- `POST /api/acquire`
- `POST /api/poll`
- `POST /api/release`
- `GET /api/tickets`
- `GET /api/tickets/{ticket_id}`

### Callback

- `GET /api/tickets/{ticket_id}/callbacks`
- `POST /api/tickets/{ticket_id}/callbacks`

### Provider resources

- `GET /api/providers/{provider}/balance`
- `POST /api/providers/{provider}/prices`
- `GET /api/providers/{provider}/countries`
- `POST /api/providers/{provider}/operators`
- `POST /api/providers/{provider}/services`

说明：

- 对外统一要求：`countries / services / operators` 动态发现前，provider 必须已配置有效 `api_key`
- 未配置时返回 `invalid request: provider \`...\` requires api_key before resource discovery`
- `/api/providers/{provider}/options` 已移除；需要完整动态选项时，调用方按 `countries -> operators -> services` 级联获取
- daemon 内部 option cache 也通过这 3 条资源链路聚合结果，不再依赖旧 `options` 端点

### Routing plan

- `GET /api/routing-plans`
- `POST /api/routing-plans`
- `GET /api/routing-plans/{plan_id}`
- `DELETE /api/routing-plans/{plan_id}`
- `POST /api/routing/failover`

---

## 典型调用链

### 1. 查询国家、运营商、服务

`HeroSMS` / `SmsBower`：

1. `GET /api/providers/{provider}/countries`
2. `POST /api/providers/{provider}/operators`，body 可传 `{ "country": "50" }`
3. `POST /api/providers/{provider}/services`，body 可为空

`5SIM`：

1. `GET /api/providers/fivesim/countries`
2. `POST /api/providers/fivesim/operators`，body 传 `{ "country": "england" }`
3. `POST /api/providers/fivesim/services`，body 传 `{ "country": "england", "operator": "any" }`

说明：

- 三家现在统一要求先配置 `api_key` 才允许动态发现这些资源
- `5SIM` 的服务发现是级联的，依赖 `country + operator`
- `HeroSMS` / `SmsBower` 当前服务发现不依赖 `country/operator`
- UI 侧对 `5SIM` 会按国家下的 operator 列表逐个探测 products，再合并成 service 列表；
  不再依赖 `operator=any` 的单点请求结果

### 2. 创建激活

```json
POST /api/acquire
{
  "provider": "mock",
  "service": "openai",
  "country": "local"
}
```

### 3. 注册验证码回调

```json
POST /api/tickets/{ticket_id}/callbacks
{
  "url": "https://example.com/callback",
  "secret": "demo"
}
```

当前行为：

- daemon 会在后台循环中尝试轮询等待中的 ticket
- 一旦 ticket 拿到 `code`，会向注册的 callback URL 发送 POST JSON
- 成功或失败都会写入运行时日志
- 运行时 `tickets` 与 `logs` 会持久化到 daemon 配置目录下的 `runtime-state.json`
- `logs` 会受 `log_buffer` 限制裁剪，`tickets` 也会按固定上限裁剪，避免无限增长
- UI 中的 `Messages`、`Recent Activity`、`Logs` 都基于这份运行时状态派生

回调 payload：

```json
{
  "ticket_id": "uuid",
  "provider": "mock",
  "service": "openai",
  "country": "local",
  "phone_number": "+15550001234",
  "code": "123456",
  "message": "mock code ready",
  "received_at": "2026-05-08T00:00:00Z"
}
```

### 4. 查询票据

- `GET /api/tickets`
- `GET /api/tickets/{ticket_id}`
- `POST /api/poll`
- `POST /api/release`

---

## 当前限制

- callback 订阅当前是 **进程内内存存储**，daemon 重启后不会保留。
- callback 投递当前是“收到 code 后一次性投递”，未实现签名校验与重试队列持久化。
- provider option cache 采用“动态聚合”模式：
  只有本轮成功发现且 provider 凭证有效时，国家 / 服务 / 运营商列表才会进入运行时缓存；
  刷新失败、凭证失效或 provider 禁用时，不保留旧聚合结果。
- `HeroSMS` 正式 REST API 与 `SmsBower` 扩展 API 的更多能力还未完全映射进 daemon 统一业务接口，例如：
  - `getActiveActivations`
  - `getAllSms`
  - `reactivate`
  - `prolong`
  - `offers`

这些能力已经完成协议梳理，但还没有全部纳入当前实现。
