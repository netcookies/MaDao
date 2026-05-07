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
