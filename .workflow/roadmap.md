# Roadmap: MaDao

## Roadmap Decisions

| # | Decision | Choice | Source (user / code / default) |
|---|----------|--------|--------------------------------|
| 1 | Scope | Complete architecture for three-provider reuse | user |
| 2 | Strategy | Progressive decomposition | code + default |
| 3 | Overwrite existing roadmap | Yes | user |

## Overview

MaDao 的“三供应商号码复用”不是一个简单的号码池需求，而是一次对 provider capability truth、runtime reuse orchestration、桌面端可见性与质量门的渐进式升级。路线应先锁定三类复用语义与三家 provider 的真实能力，再统一 backend 复用协调与持久化，最后把稳定的 runtime truth 暴露给操作者与验收链路。

## Milestones

### Milestone 1: Capability Truth (v1)
**Target**: 固化三家 provider 的复用能力真相、协议证据与测试门禁基线。
**Status**: completed

**Minimum-phase principle:** Default 1 phase per milestone. Only add phases for hard dependencies (runtime + not parallelizable + full barrier). Wave DAG inside each phase handles task ordering.

#### Phases

- [x] **Phase 1: Provider Capability Truth And Fixture Baseline** — 锁定复用语义、provider 角色与协议样例基线。

#### Phase Details

##### Phase 1: Provider Capability Truth And Fixture Baseline
**Goal**: 建立三供应商复用能力的单一真相，沉淀后续 backend 设计所需的协议样例、语义边界与验证门禁。
**Depends on**: Nothing (first phase)
**Requirements**: REQ-Active-3
**Success Criteria** (what must be TRUE):
  1. `5SIM`、`HeroSMS`、`SmsBower` 的 `exact_reuse`、`same_activation_retry`、`intent_reuse` 能力矩阵被明确记录，并可追溯到文档或样例证据。
  2. `Retry != reuse`、`SmsBower exact path 待证据确认`、`all three providers remain in final architecture` 被固化为 locked rules。
  3. 至少形成一套可复用的协议样例/夹具与验证门禁，足以支撑后续 runtime 设计与测试。

---

### Milestone 2: Backend Reuse Architecture (v2)
**Target**: 在 Rust runtime 中完成共享复用协调、持久化与三供应商接入。
**Status**: completed

**Minimum-phase principle:** Default 1 phase per milestone. Only add phases for hard dependencies (runtime + not parallelizable + full barrier). Wave DAG inside each phase handles task ordering.

#### Phases

- [x] **Phase 2: Shared Reuse Coordinator And Three-Provider Integration** — 统一 backend 复用协调、持久化与 provider-specific 路径。

#### Phase Details

##### Phase 2: Shared Reuse Coordinator And Three-Provider Integration
**Goal**: 让 direct / auto / routing / failover 共用 capability-aware `ReuseCoordinator`，并在 backend 完成三家 provider 的最终复用编排。
**Depends on**: Phase 1
**Requirements**: REQ-Active-1
**Success Criteria** (what must be TRUE):
  1. `RuntimeStateStore` 持久化中存在独立 `reuse_pool` 或等价结构，能够安全恢复候选、次数、状态与淘汰信息。
  2. `ReuseCoordinator` 在 direct acquire、auto-provider、routing acquire、routing failover 中一致生效，不再丢失 `reuse_phone/reuse_key` 上下文。
  3. `5SIM` 完成 `intent_reuse` 与 `exact_reuse` 的统一编排，`HeroSMS` 完成 `reactivate exact_reuse + same_activation_retry` 编排，`SmsBower` 保持 `same_activation_retry` 并具备必要 observability；`SmsBower exact` 仍仅在证据充分时接入。
  4. `exact_reuse`、`same_activation_retry`、`intent_reuse` 的三语义测试矩阵、structured logs、stale candidate 清理与 migration 验证可通过。

---

### Milestone 3: Operator Closure (v3)
**Target**: 把 backend 复用真值安全地暴露到桌面控制台与验收流程。
**Status**: completed

**Minimum-phase principle:** Default 1 phase per milestone. Only add phases for hard dependencies (runtime + not parallelizable + full barrier). Wave DAG inside each phase handles task ordering.

#### Phases

- [x] **Phase 3: Console Visibility And Activation Workflow** — 桌面端展示复用能力、状态与操作反馈。

#### Phase Details

##### Phase 3: Console Visibility And Activation Workflow
**Goal**: 让操作者在控制台中可理解三类复用路径与三家 provider 的差异，并完成最终交互闭环。
**Depends on**: Phase 2
**Requirements**: REQ-Active-2
**Success Criteria** (what must be TRUE):
  1. 控制台能够只读展示 provider reuse capability、candidate/use state、命中结果与关键 debug 信息，而 UI 仍不是复用真值来源。
  2. activation、provider 管理、状态反馈与日志界面能够区分 `exact reuse`、`intent reuse`、`same_activation_retry`、`fresh acquire` 四类路径。
  3. 面向操作者的验收清单与回归路径明确，能够验证三家 provider 在最终架构中的角色与反馈一致性。

---

## Scope Decisions

- **In scope**:
  - 三供应商最终统一纳入 capability-aware reuse architecture
  - backend-owned `ReuseCoordinator` 与 `reuse_pool` 持久化
  - `5SIM exact + intent`、`HeroSMS exact + retry`、`SmsBower retry` 的最终角色建模
  - routing / auto-provider / failover 一致性
  - 只读 debug visibility 与验收门禁
- **Deferred**:
  - `SmsBower` exact reuse 分支，直到拿到充分证据
  - `operator` 是否进入主 scope key
  - 更复杂的 pool ranking / cost heuristics
- **Out of scope**:
  - 把 UI 变成复用真值来源
  - 把 `Retry` 伪装成号码池复用
  - 因为 exact 证据不足而把 `SmsBower` 移出最终架构

## Progress

| Milestone | Phase | Status | Completed |
|-----------|-------|--------|-----------|
| 1. Capability Truth | 1. Provider Capability Truth And Fixture Baseline | Completed | 2026-05-22 |
| 2. Backend Reuse Architecture | 2. Shared Reuse Coordinator And Three-Provider Integration | Completed | 2026-05-22 |
| 3. Operator Closure | 3. Console Visibility And Activation Workflow | Completed | 2026-05-22 |
