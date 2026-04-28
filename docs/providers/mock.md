# Mock Provider 参考

Mock Provider 是本地联调专用的伪 provider，不发出任何网络请求，所有响应均来自 TOML 配置。

---

## 用途

- 开发阶段不依赖真实服务商即可联调完整 acquire → poll → release 流程
- 支持热重载：修改 `mock.toml` 后可通过 manifest reload 接口立即生效
- 余额、手机号、验证码均可自由配置

---

## 行为说明

| 方法 | 行为 |
|------|------|
| `acquire` | 立即返回成功，使用 `phone_number` 配置值，upstream_id 固定为 `"mock-activation"` |
| `poll_code` | 立即返回 `CodeReceived`，使用 `codes` 数组第一个元素 |
| `release` | 立即返回成功，响应为 `"mock release {action}"` |
| `get_balance` | 返回 `balance` 配置值，货币为 `USD` |
| `get_prices` | 返回单条价格记录，price 固定为 `0.0`，stock 为 `99` |

---

## TOML 配置

```toml
# plugins/providers/mock.toml

id          = "mock"
name        = "Mock Provider"
kind        = "mock"
enabled     = true

[defaults]
service          = "openai"
country          = "local"
max_tries        = 1
poll_timeout_sec = 15
reuse_phone      = true

[mock]
balance      = 999.0            # get_balance 返回值
phone_number = "+15550001234"   # acquire 返回的虚拟号码（E.164 格式）
codes        = [                # poll_code 依次使用的验证码
    "123456",
    "654321",
    "888888",
]
```

---

## 使用注意

- Mock Provider 的 `poll_code` **始终立即返回**第一个 code，不会模拟超时或等待
- 如需测试失败场景，可临时在代码中调整 `MockProvider::poll_code` 的返回值
- `codes` 数组仅第一个元素被当前 `poll_code` 使用，其余保留供未来扩展
