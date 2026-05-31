# HeroSMS 协议参考

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
- 默认取号动作：`getNumberV2`

---

## 当前内置适配器已覆盖的能力

基于兼容层：

- `getBalance`
- `getNumberV2`
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
- `prolong`
- `/activations/offers`

这些能力已经完成协议梳理，但还未完全进入统一 daemon 业务模型。

---

## 当前返回值校验现状

当前 `HeroSmsProvider` 的返回值校验，主要由共享的 `SharedHandlerApiProvider::request()`、`HeroSmsProvider::poll_code()`、`HeroSmsProvider::release()`、`HeroSmsProvider::apply_retry_metadata()` 完成：

- HTTP 请求发送失败会直接包装成 `SmsError::Upstream(err.to_string())`
- HTTP 非 `2xx` 时会直接把响应 body 作为 `SmsError::Upstream(text)` 返回
- `getStatus` 成功码通过 `success_status_prefix = "STATUS_OK:"` 识别
- `getStatus` 等待态通过 `wait_status_tokens` 识别
- `getStatus` 失败态通过 `failure_status_tokens` 识别
- `setStatus` 当前会按 action 校验 `ACCESS_RETRY_GET / ACCESS_ACTIVATION / ACCESS_CANCEL`
- `getNumberV2` 返回的 `canGetAnotherSms`、`activationEndTime` 已用于 `same_activation_retry` 可用性与过期时间判断

对应实现：

- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:528)
- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:845)
- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:920)

### 已覆盖

- `STATUS_OK:{code}` → `CodeReceived`
- `STATUS_WAIT_CODE` → `WaitingCode`
- `STATUS_CANCEL` / `NO_ACTIVATION` / `BAD_KEY` / `BAD_SERVICE` / `BAD_STATUS` → `Failed`
- `getNumberV2` JSON 成功响应已支持
- `setStatus` 的数值动作映射 `3 / 6 / 8` 已支持
- `reactivate` 已接入，并按 `activationId` 发起 POST

### 已知缺口

- `EARLY_CANCEL_DENIED` 目前仍主要作为普通 upstream 字符串返回，未向更高层暴露结构化字段
- OpenAPI 中 `409` 冲突错误体虽然可格式化，但还未建立更细的 daemon 业务错误模型

### 建议优先补齐

1. 扩 `wait_status_tokens`，补 `STATUS_WAIT_RETRY`、`STATUS_WAIT_RESEND`
2. 为 `setStatus` 增加 action 级成功码校验
3. 为 HTTP 非 `2xx` 错误体增加 `title / details / info` 解析
4. 单独识别 `EARLY_CANCEL_DENIED`，把 `info.minActivationTime` 暴露给上层
