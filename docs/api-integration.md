# API 联动指南

本文档面向需要把 `码到` 后端接入现有系统、脚本或测试平台的开发者，说明如何通过 HTTP API 与本地 app / daemon 联动。

基础地址默认是：

```text
http://127.0.0.1:7822
```

如果你直接启动的是桌面 app，Tauri 会在后台内嵌启动同一套 HTTP 服务，默认仍监听这个地址。

## 联动模型

典型联动链路如下：

1. 查询可用 provider 和运行时状态：`GET /api/providers`
2. 读取或更新 provider manifest：`GET/PUT /api/providers/{id}/manifest`
3. 清空指定 provider 的本地复用池：`POST /api/providers/{id}/reuse-pool`
4. 动态发现国家 / 运营商 / 服务：`countries -> operators -> services`
5. 发起接码：`POST /api/acquire`
6. 轮询或回调收码：`POST /api/poll` 或 `POST /api/tickets/{ticket_id}/callbacks`
7. 成功后结束 / 失败后取消：`POST /api/release`

当前 `GET /api/providers` 返回的 `RuntimeSnapshot` 还会包含复用相关状态：

- `providers[].reuse_capabilities`
- `tickets[].acquire_path`
- `tickets[].same_activation_retry_supported`
- `tickets[].same_activation_retry_expires_at`
- `reuse_pool[]`

当前 provider manifest 的复用控制字段包括：

- `defaults.reuse_phone`
- `defaults.reuse_max`
- `defaults.reuse_ttl_hours`

国家字段约定：

- 系统对外 `country` 主字段默认使用 `ISO 3166-1 alpha-2` 大写码，例如 `US`、`GB`
- `local` / `any` 仍是合法 sentinel，分别表示本地流与自动选择流
- 旧 slug、国家名、provider 数字值仍可兼容读取，但新写入与回写统一落 canonical 值

## 常用接口

鉴权说明：

- `GET /health`、`GET /auth/status`、`GET /auth/check`、`POST /auth/login`、`POST /auth/logout`、`GET /api/access-info` 为公开端点
- 其余大多数 `/api/*` 端点需要鉴权
- 推荐脚本 / 服务端调用方式：`Authorization: Bearer <http_secret>`
- 另一种方式是先 `POST /auth/login`，再复用返回的 `madao_http_session` cookie

完整机器可读规范见 [docs/openapi/daemon.openapi.yaml](openapi/daemon.openapi.yaml)。

### 运行时与配置

- `GET /health`
- `GET /api/providers`
- `GET /api/provider-manifests`
- `POST /api/provider-manifests/reload`
- `GET /api/settings/runtime`
- `POST /api/settings/runtime`
- `GET /api/settings/option-cache`

### 资源发现

- `GET /api/providers/{provider}/countries`
- `POST /api/providers/{provider}/operators`
- `POST /api/providers/{provider}/services`
- `POST /api/providers/{provider}/prices`
- `GET /api/providers/{provider}/balance`

### 激活与验证码

- `POST /api/acquire`
- `POST /api/poll`
- `POST /api/release`
- `GET /api/tickets`
- `GET /api/tickets/{ticket_id}`
- `GET /api/tickets/{ticket_id}/callbacks`
- `POST /api/tickets/{ticket_id}/callbacks`

更完整的接口说明见 [docs/daemon-api.md](daemon-api.md)。

## 示例：创建激活并轮询验证码

```bash
curl -X POST http://127.0.0.1:7822/api/acquire \
  -H 'Authorization: Bearer YOUR_HTTP_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "mock",
    "service": "openai",
    "country": "local"
  }'
```

返回示例：

```json
{
  "ticket_id": "0196c7c5-4c44-7e8a-a73f-0fe476df3e89",
  "provider": "mock",
  "service": "openai",
  "country": "local",
  "phone_number": "+15550001234"
}
```

随后轮询：

```bash
curl -X POST http://127.0.0.1:7822/api/poll \
  -H 'Authorization: Bearer YOUR_HTTP_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "ticket_id": "0196c7c5-4c44-7e8a-a73f-0fe476df3e89"
  }'
```

如果拿到验证码，再结束订单：

```bash
curl -X POST http://127.0.0.1:7822/api/release \
  -H 'Authorization: Bearer YOUR_HTTP_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "ticket_id": "0196c7c5-4c44-7e8a-a73f-0fe476df3e89",
    "action": "finish"
  }'
```

## 示例：通过回调联动业务系统

如果你希望 `码到` 主动把验证码推回业务系统，可以为 ticket 注册 callback：

```bash
curl -X POST http://127.0.0.1:7822/api/tickets/0196c7c5-4c44-7e8a-a73f-0fe476df3e89/callbacks \
  -H 'Authorization: Bearer YOUR_HTTP_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/madao/callback",
    "secret": "demo"
  }'
```

收到验证码后，daemon 会向你的 URL 发送 JSON：

```json
{
  "ticket_id": "0196c7c5-4c44-7e8a-a73f-0fe476df3e89",
  "provider": "mock",
  "service": "openai",
  "country": "local",
  "phone_number": "+15550001234",
  "code": "123456",
  "message": "mock code ready",
  "received_at": "2026-05-08T00:00:00Z"
}
```

适用场景：

- 自动化注册 / 登录测试
- 内部风控 / 验证码中台
- 手工平台和本地桌面 app 联动

## 示例：动态切换服务商配置

读取 manifest：

```bash
curl http://127.0.0.1:7822/api/providers/herosms/manifest
```

更新 manifest：

```bash
curl -X PUT http://127.0.0.1:7822/api/providers/herosms/manifest \
  -H 'Content-Type: application/json' \
  -d @manifest.json
```

这会触发：

1. manifest 持久化到用户配置目录
2. `ProviderRegistry` 重载
3. UI 与运行时快照刷新

如果你要手动清空某个 provider 的本地复用池，可以调用：

```bash
curl -X POST http://127.0.0.1:7822/api/providers/herosms/reuse-pool \
  -H 'Authorization: Bearer YOUR_HTTP_SECRET'
```

这意味着你可以把 `码到` 当作本地 provider orchestration service 使用，而不是只能手工点 UI。

## 运行时设置联动

你可以通过 `POST /api/settings/runtime` 调整部分运行时行为：

```json
{
  "routing_strategy": "ordered_priority",
  "auto_fallback": true,
  "option_cache_enabled": true,
  "option_cache_poll_interval_minutes": 30,
  "only_show_openai_sms_countries": false,
  "check_updates_on_launch": true
}
```

当前这组设置会持久化到用户配置目录下的 `runtime-settings.json`。

其中 `only_show_openai_sms_countries` 的业务语义固定为：

```text
当前平台支持国家 - (whatsapp_regions - sms_regions)
```

解释：

- `sms_regions` 内的国家始终保留
- 只排除 `whatsapp-only` 国家
- 如果一个国家同时存在于 `sms_regions` 和 `whatsapp_regions`，仍然视为“可接收短信”，必须继续显示

## 错误处理建议

- 所有非 `2xx` 响应都应读取 JSON `message` 字段或原始文本。
- `handler_api` 与 `five_sim` 的上游错误会被归一化后透传，不要只看 HTTP 状态码。
- 资源发现接口依赖有效 `api_key`；未配置时会直接返回 `invalid request`。
- callback 当前不是持久化重试队列，接入方需要自行处理幂等。

## 相关文档

- [docs/daemon-api.md](daemon-api.md)
- [docs/providers.md](providers.md)
- [docs/architecture.md](architecture.md)
