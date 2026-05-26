# Project: MaDao

## What This Is

MaDao 是一个基于 `Rust + Tauri 2 + React` 的内部协议兼容控制台，面向团队自建平台的通知 / OTP 测试能力。它提供统一的 provider 接入、运行时管理、桌面控制台和本地通信能力，用于团队内部的接码与验证运维场景。

## Core Value

统一管理多种 SMS provider 协议，并通过一个可配置、可热重载、可观测的桌面控制台完成号码获取、轮询、释放和运行时维护。

## Requirements

### Validated

- 已具备 Rust workspace 分层、provider manifest 配置、运行时 API 与桌面 UI 主路径。

### Active

- [ ] 稳定 provider 获取、轮询、释放与错误处理链路
- [ ] 完善桌面控制台中的 provider 管理、激活流程和状态反馈
- [ ] 补齐协议样例、验证门禁与后续 roadmap 所需项目状态

### Out of Scope

- 面向公开第三方市场的通用 SaaS 化产品化能力 — 当前目标是团队内部、自建平台协议兼容与运维控制
- 在 UI 层重复实现 provider 业务规则 — 业务真值应保留在 Rust runtime / service 层

## Context

仓库当前已经形成 `plugin-sdk / sms-core / sms-server / daemon / src-tauri / ui` 的清晰分层，并保留 provider manifest 热重载、HTTP API、Tauri 菜单栏与 Apple 风格控制台。`.workflow/specs/` 已根据现有代码生成了编码约定、架构约束、质量规则和测试约定，可作为后续 roadmap、plan、execute 阶段的输入。

## Constraints

- **Architecture**: UI 通过 `ui/src/services/*` 访问 runtime，provider 协议规则保留在 Rust 层 — 避免跨层状态漂移与重复实现
- **Product scope**: 聚焦内部协议兼容平台，而非公开市场聚合器 — 限制需求扩张
- **Workflow safety**: 现有 `.workflow/` 目录曾承载多套历史会话，后续仅保留项目级状态与 specs — 防止旧会话污染当前项目状态

## Tech Stack

- **Language**: TypeScript, Rust
- **Framework**: React 19, Vite, Tauri 2, Axum
- **Database**: 运行态数据（tickets、logs、activity、reuse pool、balance cache）通过 SQLite (`runtime.db`) 持久化；配置类数据（settings、routing plans、options cache）仍为 JSON 文件

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用 provider manifest + provider trait 解耦协议差异 | 需要兼容 HeroSMS、SmsBower、5SIM 和 mock | 已采用 |
| 使用 Rust service 持有运行时真值 | 避免前端状态和 provider 业务规则分散 | 已采用 |
| 使用 Tailwind + design token 作为 UI 主路径 | 统一 Apple 风格桌面 UI 的实现与维护 | 已采用 |
| Coordinator 在 acquire_code_for_provider 前拦截 | 四条 acquire 路径汇聚于此，单点覆盖 | Phase 2 — 2026-05-22 |
| 运行态持久化迁移到 RuntimeStore (SQLite) | 事务性批量写入，InMemory fallback 保证无 DB 时仍可运行 | Phase 2 → 重构 2026-05-26 |
| HeroSMS reactivation 通过 acquire() 分支实现 | handler_api 协议复用 getNumber action | Phase 2 — 2026-05-22 |

## Stakeholders

- 内部平台接码 / 通知测试与运维团队
- 负责 provider 接入、协议适配和桌面控制台维护的开发者

---
*Last updated: 2026-05-06 after workflow bootstrap*
