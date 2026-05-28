# MaDao Stats Worker

Cloudflare Worker + D1，用于接收 app 上传的匿名统计事件，并返回按服务、国家、运营商、服务商聚合的近期汇总数据。

## Endpoints

- `GET /health`
- `POST /v1/events`
- `GET /v1/summary?service=&country=&operator=&provider=&lookback_hours=24`

## Auth

上传接口需要：

`Authorization: Bearer <API_TOKEN>`

查询接口当前默认公开，后续可按需要加鉴权或速率限制。

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

在 `wrangler.jsonc` 中将 `API_TOKEN` 替换为你自定义的密钥（用于 app 上传事件时鉴权）：

```jsonc
"vars": {
  "API_TOKEN": "<你的自定义密钥>"
}
```

生产环境建议使用 `wrangler secret put API_TOKEN` 设置为加密 secret，而非明文写在配置里。

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
