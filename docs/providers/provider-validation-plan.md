# Provider Validation Hardening Plan

> **Status: Planning** — 本文档为内部规划记录，描述 provider 返回值校验的改进方向。

本文档用于统一规划 `HeroSMS`、`SmsBower`、`5SIM` 三类 provider 的返回值校验完善工作。

---

## 目标

当前三类 provider 都已具备基本可用能力，但返回值校验仍存在三类共性问题：

- 成功响应校验不够严格，部分路径只要 HTTP 成功就直接视为成功
- 等待态 / 失败态枚举不完整，部分合法状态会被误判
- HTTP 非 `2xx` 错误体缺少结构化解析，UI 难以给出精确提示

本计划的目标是把 provider 侧返回值处理提升到“可诊断、可扩展、可验证”的状态。

---

## 范围

本次完善覆盖：

- `HeroSMS`
- `SmsBower`
- `5SIM`

涉及文件预计包括：

- `crates/sms-core/src/provider.rs`
- `crates/plugin-sdk/src/lib.rs`
- `plugins/providers/herosms.toml`
- `plugins/providers/smsbower.toml`
- `plugins/providers/fivesim.toml`
- `docs/providers/*.md`
- `ui` 侧针对 provider 错误提示的翻译与展示

---

## Phase 1：状态枚举补全

### HeroSMS / SmsBower

- 补 `getStatus` 的等待态：
  - `HeroSMS`：`STATUS_WAIT_RETRY`、`STATUS_WAIT_RESEND`
  - `SmsBower`：先确认并补 `STATUS_WAIT_RETRY`
- 校验 `setStatus` 成功值：
  - `retry` → `ACCESS_RETRY_GET`
  - `finish` → `ACCESS_ACTIVATION`
  - `cancel` / `ban` → `ACCESS_CANCEL`

### 5SIM

- 明确 `check` 状态映射：
  - `PENDING` → `WaitingCode`
  - `RECEIVED` 且无 code → `WaitingCode`
  - `RECEIVED` 且有 code → `CodeReceived`
  - `FINISHED` 且有 code → `CodeReceived`
  - `CANCELED` / `BANNED` / `TIMEOUT` → `Failed`
- 校验 `finish / cancel / ban` 返回的订单对象状态是否符合预期，而不是只要 HTTP 成功就放行

交付物：

- 配置 token / status 列表补全
- provider 单元测试补全
- 协议文档同步更新

---

## Phase 2：结构化错误解析

### HeroSMS / SmsBower

- 为 HTTP 非 `2xx` 错误增加 `BaseErrorResponse` 解析：
  - `title`
  - `details`
  - `info`
- 优先处理：
  - `EARLY_CANCEL_DENIED`
  - `FREE_CANCELLATION_EXPIRED`
  - `OTP_RECEIVED`
  - `NO_ACTIVATION`
  - `BAD_STATUS`

### 5SIM

- 为纯文本错误补统一分类：
  - `no free phones`
  - `not enough user balance`
  - `not enough rating`
  - `bad country`
  - `bad operator`
  - `no product`
  - `server offline`
  - `order not found`
- 如上游后续返回 JSON 错误体，需要预留结构化解析入口

交付物：

- 统一错误分类函数
- UI 可读的 provider-specific 提示
- 文档中的错误码映射表

---

## Phase 3：统一抽象与配置收敛

目标是减少 provider 逻辑散落在实现中的硬编码，把更多协议差异下沉到配置或通用解析层。

建议内容：

- 为 `handler_api` 引入 action 级成功码配置
- 为 `handler_api` 引入更完整的等待态 / 失败态默认值
- 为 `5SIM` 引入 release 目标状态校验配置
- 统一错误对象模型，避免上层只能拿到 `SmsError::Upstream(String)`

交付物：

- `plugin-sdk` 配置结构扩展
- manifest 模板升级
- provider 解析逻辑收敛

---

## Phase 4：验证与回归

必须覆盖的验证：

- 单元测试：状态映射、成功码校验、错误码分类
- 集成测试：`/api/acquire`、`/api/poll`、`/api/release`
- UI 验证：消息卡片、状态提示、取消按钮错误反馈
- 文档验证：实现与协议文档保持一致

重点回归场景：

- `HeroSMS` 2 分钟内取消
- `HeroSMS / SmsBower` 等待重发状态
- `5SIM` 无号、余额不足、订单不存在
- release 成功但状态不匹配的异常路径

---

## 推荐执行顺序

1. 先做 `HeroSMS / SmsBower` 的 `getStatus` 和 `setStatus` 校验补全
2. 再做 `5SIM` 的 release 状态校验与纯文本错误分类
3. 然后做跨 provider 的结构化错误抽象
4. 最后补 UI 提示和全套测试

---

## 当前结论

如果只看“必要且最容易产生成本的缺口”，优先级最高的是：

1. `HeroSMS / SmsBower` 漏判 `STATUS_WAIT_RETRY`、`STATUS_WAIT_RESEND`
2. `HeroSMS / SmsBower` 未校验 `setStatus` 的成功返回值
3. `5SIM` 未校验 `finish / cancel / ban` 返回对象中的最终状态
4. 三类 provider 都缺少更结构化的错误上抛
