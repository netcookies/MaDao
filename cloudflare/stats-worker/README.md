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

## Suggested deployment steps

1. 创建 D1 数据库
2. 将 `wrangler.jsonc` 中的 `database_id` 与 `API_TOKEN` 替换为真实值
3. 运行 `npm install`
4. 本地开发：`npm run dev`
5. 部署：`npm run deploy`
