# Architecture

## 总览

`MaDao` 当前采用分层架构：

1. `plugin-sdk`
2. `sms-core`
3. `sms-server`
4. `apps/daemon`
5. `src-tauri`
6. `ui`

目标是让协议兼容、运行时状态、桌面宿主和前端控制台解耦。

## 分层说明

### `crates/plugin-sdk`

职责：

- 定义 `ProviderManifest`
- 定义 `ProviderKind`
- 定义 `HandlerApiConfig / FiveSimConfig / MockConfig`
- 提供协议兼容所需的默认配置项

这里是 provider manifest 的单一结构定义源。

### `crates/sms-core`

职责：

- 统一领域模型：请求 / 响应 / runtime snapshot / provider summary
- `SmsProvider` trait
- `HandlerApiProvider / FiveSimProvider / MockProvider`
- `ProviderRegistry`
- `SmsService`

这是系统的领域中心。

### `crates/sms-server`

职责：

- 暴露 HTTP API
- 把 `SmsService` 映射为外部可调用接口

当前重点接口包括：

- runtime snapshot
- provider manifest list / get / save / reload
- balance / prices

### `apps/daemon`

职责：

- 启动 HTTP 服务
- 启动 Unix socket
- 提供本地 JSON command 协议

它是本地宿主进程，不承担领域规则。

### `src-tauri`

职责：

- 桌面壳
- Tauri commands
- 挂载共享的 `SmsService`

原则是：Tauri 只做桌面桥接，不写业务规则。

### `ui`

职责：

- Apple 风格控制台界面
- provider manifest 编辑
- 余额 / 价格 / 运行时状态展示

当前前端使用 HTTP 直接读取后端 API。

## 运行时流

```text
provider manifest (*.toml)
  -> ProviderRegistry
  -> SmsService
  -> HTTP / socket / Tauri
  -> React UI
```

## 热重载流

```text
UI 编辑 manifest
  -> PUT /api/providers/{id}/manifest
  -> SmsService::save_provider_manifest
  -> ProviderRegistry::save_manifest
  -> ProviderRegistry::reload
  -> runtime snapshot 立即反映
```

## 当前架构结论

当前架构已经具备：

- 协议兼容扩展点
- 配置热重载能力
- 多入口通信
- 桌面控制台

后续重点会落在：

- 内部平台真实返回样例映射
- 更强的日志与事件流
- Windows 本地通信兼容
- 配置权限与审计
