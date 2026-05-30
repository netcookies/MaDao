# Daemon API

Daemon 对外暴露的 HTTP API 完整参考。面向场景的集成示例见 [api-integration.md](api-integration.md)。

基础地址：`http://127.0.0.1:7822`

---

## 鉴权

### 机制

Daemon 使用 HTTP secret 作为唯一凭证。首次启动时自动生成并持久化到 `runtime-settings.json`。

两种鉴权方式：

1. **Bearer token**（推荐脚本 / 服务端调用）：`Authorization: Bearer <http_secret>`
2. **Session cookie**：先 `POST /auth/login` 获取 `madao_http_session` cookie，后续请求自动携带

### 公开端点（无需鉴权）

- `GET /health`
- `GET /auth/status` — 当前会话是否已认证
- `GET /auth/check` — 检查 secret 是否已配置
- `POST /auth/login` — 用 secret 换取 session cookie
- `POST /auth/logout` — 销毁当前 session
- `GET /api/access-info` — 返回当前 HTTP secret（仅本地 socket 可用）

### Secret 管理

- Secret 持久化在用户配置目录的 `runtime-settings.json` 中
- `POST /api/settings/runtime/regenerate-secret` — 重新生成 secret，旧 token 立即失效
- Docker 模式下 `MADAO_HTTP_SECRET` 环境变量可覆盖持久化值
- UI 中不支持手动编辑 secret，只能重新生成

### Session 行为

- Session 存储在进程内存中，daemon 重启后所有 session 失效
- Cookie 属性：`HttpOnly; SameSite=Lax; Path=/`
- 无固定过期时间，随进程生命周期存活

---

## 完整路由表

### Auth

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/health` | 公开 | 健康检查 |
| `GET` | `/auth/status` | 公开 | 当前会话认证状态 |
| `GET` | `/auth/check` | 公开 | Secret 是否已配置 |
| `POST` | `/auth/login` | 公开 | 登录获取 session |
| `POST` | `/auth/logout` | 公开 | 销毁 session |
| `GET` | `/api/access-info` | 公开 | 返回 HTTP secret（仅 socket） |

### Runtime & Settings

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/providers` | 生产运行态 provider 列表（不含 `mock`） |
| `GET` | `/api/provider-manifests` | 完整 manifest 列表（含 `mock`） |
| `POST` | `/api/provider-manifests/reload` | 热重载所有 manifest |
| `POST` | `/api/providers/reorder` | 调整 provider 优先级顺序 |
| `GET` | `/api/notifications` | 运行时通知列表 |
| `GET` | `/api/settings/runtime` | 读取运行时设置 |
| `POST` | `/api/settings/runtime` | 更新运行时设置 |
| `POST` | `/api/settings/runtime/regenerate-secret` | 重新生成 HTTP secret |
| `GET` | `/api/settings/option-cache` | 读取 option cache 状态 |
| `GET` | `/api/settings/openai-sms-regions` | 读取 OpenAI 短信区域缓存 |

### Stats

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/settings/stats/sync` | 立即同步待上传的统计事件 |
| `POST` | `/api/settings/stats/summary` | 查询远端统计汇总 |

### Activation

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/acquire` | 创建激活（获取号码） |
| `POST` | `/api/poll` | 轮询验证码 |
| `POST` | `/api/release` | 结束或取消订单 |
| `GET` | `/api/tickets` | 查询所有 ticket |
| `GET` | `/api/tickets/{ticket_id}` | 查询单个 ticket |
| `GET` | `/api/tickets/{ticket_id}/callbacks` | 查询 ticket 的回调注册 |
| `POST` | `/api/tickets/{ticket_id}/callbacks` | 为 ticket 注册回调 |

### Provider Resources

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/providers/{provider}/balance` | 查询余额 |
| `POST` | `/api/providers/{provider}/prices` | 查询价格 |
| `GET` | `/api/providers/{provider}/countries` | 国家列表 |
| `POST` | `/api/providers/{provider}/operators` | 运营商列表 |
| `POST` | `/api/providers/{provider}/services` | 服务列表 |
| `POST` | `/api/providers/{provider}/refresh-options` | 刷新 option cache |
| `GET` | `/api/providers/{provider}/options-cache` | 读取 option cache |
| `GET` | `/api/providers/{provider}/manifest` | 读取单个 manifest |
| `PUT` | `/api/providers/{provider}/manifest` | 更新单个 manifest |
| `POST` | `/api/providers/{provider}/reuse-pool` | 清空复用池 |

### Routing Plan

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/routing-plans` | 列出所有方案 |
| `POST` | `/api/routing-plans` | 创建方案 |
| `GET` | `/api/routing-plans/{plan_id}` | 读取单个方案 |
| `DELETE` | `/api/routing-plans/{plan_id}` | 删除方案 |
| `POST` | `/api/routing/replace` | 换号并收口当前 ticket |
| `POST` | `/api/routing/failover` | 推进到下一条候选 |

完整 OpenAPI 规范：[docs/openapi/daemon.openapi.yaml](openapi/daemon.openapi.yaml)

---

## 关键字段说明

### RuntimeSnapshot（`GET /api/providers`）

重点字段：`reuse_capabilities`、`acquire_path`、`same_activation_retry_supported`、`reuse_pool[]`。

该接口只返回可用于真实下单的 provider；`mock` provider 通过 `/api/provider-manifests` 读取。

### RuntimeSettings

字段：`routing_strategy`、`auto_fallback`、`option_cache_enabled`、`option_cache_poll_interval_minutes`、`only_show_openai_sms_countries`、`check_updates_on_launch`。

`only_show_openai_sms_countries` 过滤规则：排除 whatsapp-only 国家，保留 `sms_regions` 中的国家。

### Manifest 复用配置

`defaults.reuse_phone`、`defaults.reuse_max`、`defaults.reuse_ttl_hours`。

### 资源发现

资源发现前 provider 必须已配置有效 `api_key`。资源项统一返回 `value`、`label`、`hint`、`provider_value`。国家项额外返回 `label_zh`。

---

## 典型调用链

### 1. 资源发现

**HeroSMS / SmsBower：**

1. `GET /api/providers/{provider}/countries`
2. `POST /api/providers/{provider}/operators`（body: `{ "country": "US" }`）
3. `POST /api/providers/{provider}/services`（body 可为空）

**5SIM：**

1. `GET /api/providers/fivesim/countries`
2. `POST /api/providers/fivesim/operators`（body: `{ "country": "GB" }`）
3. `POST /api/providers/fivesim/services`（body: `{ "country": "GB", "operator": "any" }`）

说明：

- 所有对外 `country` 主字段使用 ISO 3166-1 alpha-2 大写码
- 5SIM 服务发现是级联的（依赖 `country + operator`），HeroSMS / SmsBower 不依赖
- `/countries` 中 5SIM 原生 `england` 会返回 `value: "GB"`、`label_zh: "英国"`、`provider_value: "england"`

### 2. 创建激活

```json
POST /api/acquire
{
  "provider": "mock",
  "service": "openai",
  "country": "local"
}
```

`country` 使用 ISO 3166-1 alpha-2 大写码，`local` / `any` 是合法 sentinel。

复用优先级：`same_activation_retry` → `exact_reuse` → `intent_reuse` → `fresh_acquire`。当 `defaults.reuse_phone = false` 时所有复用路径关闭。

`acquire_path` 可见值：`fresh_acquire`、`exact_reuse`、`intent_reuse`、`same_activation_retry`。

清空复用池：`POST /api/providers/{provider}/reuse-pool`（只清空本地候选池，不影响历史 ticket 或上游状态）。

### 3. 注册验证码回调

```json
POST /api/tickets/{ticket_id}/callbacks
{
  "url": "https://example.com/callback",
  "secret": "demo"
}
```

Daemon 后台循环轮询等待中的 ticket，拿到 code 后向注册的 callback URL 发送 POST。运行时数据（tickets、logs、activity、reuse_pool、余额缓存）持久化到 `runtime.db`，受 buffer 限制裁剪。

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

- `GET /api/tickets` / `GET /api/tickets/{ticket_id}`
- `POST /api/poll` / `POST /api/release`

---

## 当前限制

- Callback 订阅为进程内内存存储，daemon 重启后不保留
- Callback 投递为一次性投递，未实现签名校验与重试队列持久化
- Option cache 采用动态聚合模式：刷新失败、凭证失效或 provider 禁用时不保留旧结果
- HeroSMS / SmsBower 的部分扩展能力（`getActiveActivations`、`getAllSms`、`reactivate`、`prolong`、`offers`）已完成协议梳理但未全部纳入实现
