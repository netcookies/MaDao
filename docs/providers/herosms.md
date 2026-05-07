# HeroSMS Protocol Reference

官方来源：

- 兼容层文档：`https://hero-sms.com/api#tag/sms-activate`
- 下载版 OpenAPI：`/Users/isulewli/Downloads/api___en.json`

---

## 协议定位

`HeroSMS` 不应再被简单视作“纯标准 handler_api”。

更准确的说法是：

- 它兼容 `sms-activate / handler_api` 风格接口
- 它还有一套更正式的 API 描述与扩展能力

当前项目里，`HeroSMS` 已拆成独立适配器：

- 运行时协议名：`herosms`
- 适配器类型：`HeroSmsProvider`

---

## 当前内置适配器已覆盖的能力

基于兼容层：

- `getBalance`
- `getNumber`
- `getStatus`
- `setStatus`
- `getPrices`
- `getCountries`
- `getServicesList`
- `getOperators`

对应代码：

- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs)

---

## 从 OpenAPI 中已确认的额外能力

从 [api___en.json](</Users/isulewli/Downloads/api___en.json>) 已确认以下接口存在：

### Activation / query

- `GET ?action=getActiveActivations`
- `GET ?action=getAllSms`
- `GET ?action=finishActivation`
- `GET ?action=cancelActivation`
- `POST ?action=reactivate`
- `POST ?action=prolong`

### Resource discovery

- `GET ?action=getCountries`
- `GET ?action=getServicesList`
- `GET ?action=getOperators`
- `GET ?action=getTopCountriesByService`（deprecated）
- `GET /activations/offers`

### Webhook

OpenAPI 中存在 webhook payload 描述：

- `webhooks.sms-incoming`

字段包括：

- `activationId`
- `service`
- `text`
- `code`
- `country`
- `receivedAt`

---

## 当前 daemon 对外映射状态

当前已经映射到 daemon API 的：

- 创建激活
- 轮询验证码
- 取消 / 完成
- 查询票据
- 注册 code callback
- 查询国家 / 服务 / 运营商
- 创建 / 查询 / 删除 routing plan

尚未完整映射的 HeroSMS 特有能力：

- `getActiveActivations`
- `getAllSms`
- `reactivate`
- `prolong`
- `/activations/offers`

这些能力已经完成协议梳理，但还未完全进入统一 daemon 业务模型。
