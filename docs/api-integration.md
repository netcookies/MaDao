# API 联动指南

面向需要把码到后端接入现有系统、脚本或测试平台的开发者。本文档侧重场景示例和快速上手；完整路由参考见 [daemon-api.md](daemon-api.md)。

基础地址：`http://127.0.0.1:7822`（桌面 app 内嵌的 HTTP 服务使用相同地址）

## 联动模型

典型调用链路：

1. 查询可用 provider 和运行时状态：`GET /api/providers`
2. 读取或更新 provider manifest：`GET/PUT /api/providers/{id}/manifest`
3. 清空指定 provider 的本地复用池：`POST /api/providers/{id}/reuse-pool`
4. 动态发现资源：`countries → operators → services`
5. 发起接码：`POST /api/acquire`
6. 轮询或回调收码：`POST /api/poll` 或 `POST /api/tickets/{ticket_id}/callbacks`
7. 结束 / 取消：`POST /api/release`

`GET /api/providers` 返回的 `RuntimeSnapshot` 包含复用相关状态（`reuse_capabilities`、`acquire_path`、`same_activation_retry_supported`、`reuse_pool[]` 等）。该接口是生产运行态视图，只返回可用于真实下单的 provider；`mock` provider 通过 manifest 管理接口读取。

Manifest 复用控制字段：`defaults.reuse_phone`、`defaults.reuse_max`、`defaults.reuse_ttl_hours`

国家字段约定：系统对外 `country` 主字段使用 ISO 3166-1 alpha-2 大写码（如 `US`、`GB`）。`local` / `any` 是合法 sentinel。旧 slug、国家名、provider 数字值仍可兼容读取，新写入统一落 canonical 值。

## 鉴权

- 公开端点：`GET /health`、`GET /auth/status`、`GET /auth/check`、`POST /auth/login`、`POST /auth/logout`、`GET /api/access-info`
- 其余 `/api/*` 端点需要鉴权
- 推荐方式：`Authorization: Bearer <http_secret>`
- 备选方式：先 `POST /auth/login`，再复用 `madao_http_session` cookie

完整机器可读规范见 [docs/openapi/daemon.openapi.yaml](openapi/daemon.openapi.yaml)。

## 常用接口

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

资源项统一语义：`value`（MaDao canonical 主键）、`label`（英文显示名）、`label_zh`（国家项中文名）、`provider_value`（provider 原生值）。

价格项中 `country` 使用 canonical 值，`display_name` / `display_name_zh` 提供显示名，`provider_country` 保留原生值。

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

通过 `POST /api/settings/runtime` 调整运行时行为：

```json
{
  “routing_strategy”: “ordered_priority”,
  “auto_fallback”: true,
  “option_cache_enabled”: true,
  “option_cache_poll_interval_minutes”: 30,
  “only_show_openai_sms_countries”: false,
  “check_updates_on_launch”: true
}
```

设置持久化到用户配置目录下的 `runtime-settings.json`。

`only_show_openai_sms_countries` 语义：排除 whatsapp-only 国家，保留 `sms_regions` 中的国家。同时存在于两者中的国家仍然显示。

## 错误处理

- 所有非 `2xx` 响应都应读取 JSON `message` 字段或原始文本
- `handler_api` 与 `five_sim` 的上游错误会被归一化后透传
- 资源发现接口依赖有效 `api_key`，未配置时返回 `invalid request`
- Callback 当前不是持久化重试队列，接入方需自行处理幂等

## 相关文档

- [docs/daemon-api.md](daemon-api.md)
- [docs/providers.md](providers.md)
- [docs/architecture.md](architecture.md)
