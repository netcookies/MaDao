# MaDao Stats Worker

Cloudflare Worker + D1，用于接收 app 上传的匿名统计事件，并返回按服务、国家、运营商、服务商聚合的近期汇总数据。

App/daemon 侧启用统计同步后，会大约每分钟自动批量上传待同步事件；Settings 中的 `Sync now` 只是立即补同步入口。Worker 侧不会主动拉取 app 数据，只负责接收上传、刷新快照和提供汇总读取。

## Endpoints

- `GET /health`
- `GET /`（统计仪表盘，读取缓存快照）
- `POST /v1/events`
- `GET /v1/summary?lookback_hours=24|72|168`（公开快照汇总）
- `GET /v1/admin/summary?service=&country=&operator=&provider=&lookback_hours=24`（运维实时/过滤汇总）
- `POST /v1/admin/dashboard/refresh`（手动刷新仪表盘快照）

## Auth

App 自动上传使用 `POST /v1/events`。上传接口、运维实时/过滤汇总接口和手动刷新接口需要：

`Authorization: Bearer <API_TOKEN>`

`GET /` 仪表盘和 `GET /v1/summary` 快照汇总公开可访问，不需要鉴权。

`/v1/admin/*` 接口也支持浏览器 Basic Auth。用户名或密码任一项填入 `API_TOKEN` 即可。

## Dashboard cache

`GET /` 不再按页面访问实时扫描事件明细表，而是读取 `stats_snapshots` 中的预计算快照，并用 Workers Cache API 缓存渲染后的 HTML 5 分钟。

快照刷新方式：

- Cron Trigger：`wrangler.jsonc` 中配置为每 1 小时刷新一次 dashboard 和 `24h`、`72h`、`168h` summary 快照。
- 手动刷新：`POST /v1/admin/dashboard/refresh`，需要 `Authorization: Bearer <API_TOKEN>`。
- 首次访问且快照缺失时，`GET /` 只返回空快照页面；`GET /v1/summary` 返回 `503`，等待 cron 或手动刷新后再提供快照，避免公开请求触发实时扫表。

`/v1/summary` 保持响应格式兼容，但只提供无过滤的 `24h`、`72h`、`168h` 快照。App/daemon 查询远端汇总时只访问这个公开 snapshot 接口，并在本地按 provider/service/country/operator 过滤；只有运维排查才应使用需要鉴权的 `/v1/admin/summary`。

为控制 D1 免费额度，Worker 会通过独立 cron 在每天 UTC 02:55 清理 7 天前的事件明细。单次最多删除 1000 条，避免一次性大批量删除消耗过多写额度；随后 UTC 03:00 的整点快照刷新会基于已裁剪的数据执行。

汇总语义当前按 `ticket_id` 的最后一条事件计算，避免同一 Ticket 的 `acquired`、`code_received`、`finished` 等多阶段事件被重复计数。

## Event model

Worker 接收的单条事件字段：

- `id`
- `ticket_id`
- `provider`
- `service`
- `country`
- `operator`
- `outcome`
- `status`
- `occurred_at`
- `routing_plan_id`
- `routing_item_id`
- `message`

## 部署步骤

### 前置条件

- Node.js + npm
- Cloudflare 账户
- Wrangler CLI（已包含在 devDependencies，也可全局安装 `npm i -g wrangler`）

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

浏览器会弹出授权页面，完成后 CLI 获得部署权限。

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create madao-stats
```

命令输出会包含 `database_id`，将其填入 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "madao-stats",
    "database_id": "<你的 database_id>"
  }
]
```

### 3. 配置 API Token

使用 Wrangler secret 配置密钥（用于 app 上传事件、运维实时汇总、手动刷新鉴权）：

```bash
npx wrangler secret put API_TOKEN
```

### 4. 安装依赖

```bash
npm install
```

### 5. 本地开发

```bash
npm run dev
```

### 6. 部署

```bash
npm run deploy
```

Worker 会自动创建/更新到你的 Cloudflare 账户下。数据库表结构由 Worker 首次请求时自动创建（`ensureSchema`），无需手动执行 SQL。

部署后可手动预热一次仪表盘快照：

```bash
curl -X POST https://<你的 worker 域名>/v1/admin/dashboard/refresh \
  -H "Authorization: Bearer <API_TOKEN>"
```
