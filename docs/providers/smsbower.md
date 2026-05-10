# SmsBower Protocol Reference

官方来源：

- `https://smsbower.app/api/?page=client`

---

## 协议定位

`SmsBower` 可以视为：

- `handler_api` 兼容协议
- 加上一组明确公开的扩展接口

当前项目里，`SmsBower` 已拆成独立适配器：

- 运行时协议名：`smsbower`
- 适配器类型：`SmsBowerProvider`

---

## 当前内置适配器已覆盖的能力

当前已接入的基础与扩展能力：

- `getBalance`
- `getNumberV2`
- `getStatus`
- `setStatus`
- `getPrices`
- `getCountries`
- `getServicesList`
- `getOperators`

说明：

- `SmsBower` 默认配置使用 `getNumberV2`
- 相比 `HeroSMS`，它的 JSON 响应与资源发现能力更丰富

---

## 官方文档明确存在的扩展

### Activation

- `getNumberV2`
- `minPrice`
- `providerIds`
- `exceptProviderIds`
- `phoneException`
- `ref`
- `userID`

### Price APIs

- `getPrices`
- `getPricesV2`
- `getPricesV3`

### Resource discovery

- `getServicesList`
- `getCountries`
- `getOperators`

### Notifications

- Webhook notification

文档里还包含国家富结构数据，字段不仅有：

- `id`
- `title`
- `iso`
- `prefix`

还包含：

- `operators`
- `alternative_params`
- `slug`

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

仍未完整映射到统一 daemon API 的扩展：

- `getPricesV2`
- `getPricesV3`
- Webhook notification 的原生配置面
- 更细粒度的国家 operator 元数据

如果后续要把 `SmsBower` 的富国家 / operator 数据完整暴露给开发者，当前 `OptionItem` 模型需要继续扩展。

---

## 当前返回值校验现状

`SmsBowerProvider` 的 `acquire / poll / release / get_balance` 当前复用了 `HeroSmsProvider` 的大部分返回值校验逻辑；价格接口则额外走 `getPricesV3`。

对应实现：

- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:983)
- [provider.rs](/Users/isulewli/Projects/MaDao/crates/sms-core/src/provider.rs:1040)

### 已覆盖

- `getNumberV2` 的 JSON 提取已兼容 `string / integer` 类型差异
- `getStatus` 的 `STATUS_OK:{code}`、`STATUS_WAIT_CODE`、`STATUS_CANCEL` 等基础状态沿用 handler_api 兼容逻辑
- `getPricesV3` 已作为优先价格数据源，失败时回退到 `getPrices`
- `getCountries / getServicesList / getOperators` 已接入

### 已知缺口

- 当前保存的 `SmsBower` HTML 明确写到 `STATUS_WAIT_RETRY:$lastCode`，但未明确写到 `STATUS_WAIT_RESEND`；现实现里这两类都没有纳入等待态配置
- `setStatus` 当前同样未校验 `ACCESS_RETRY_GET`、`ACCESS_ACTIVATION`、`ACCESS_CANCEL`
- HTTP 非 `2xx` 的错误体当前仍按原始文本上抛，未做结构化解析
- `getPricesV3` 当前只要 HTTP 成功且 JSON 可解析就继续处理，没有 provider 级错误对象分类

### 建议优先补齐

1. 先补 `SmsBower` 文档已明确给出的 `STATUS_WAIT_RETRY`，并把 `STATUS_WAIT_RESEND` 标记为“待更多上游证据确认”
2. 为 `getPricesV3` 增加错误体分类与测试
3. 把 `SmsBower` 的扩展错误语义补入共享文档，而不是只记在实现里
