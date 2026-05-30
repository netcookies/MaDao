# UI 现代化重构方案

> **Status: Completed** — 本文档记录已落地的迁移决策，保留作为架构决策记录（ADR）。当前代码已完成迁移，后续修改直接参考 [ui-component-spec.md](ui-component-spec.md) 和源码。

## 结论

当前前端已经完成从 `CSS Modules + CSS Variables + .d-* bridge` 向 `Tailwind CSS + design token` 的主路径迁移。

最终架构是：

1. `React 19`
2. `Tailwind CSS` 作为样式消费层
3. `design token + CSS variables` 作为视觉真值源
4. `primitive → composite → shell → screen` 的组件化结构

这意味着 Tailwind 只负责“消费和组合样式”，而不是重新定义一套新的颜色、圆角和间距真值。

## 当前架构

### Token 层

- `ui/src/design-system/theme.css`
  - canonical `--ds-*` token 源
- `ui/src/base.css`
  - 基础 reset + legacy alias
- `ui/src/design-system/tailwind-theme.cjs`
  - `--ds-*` 到 Tailwind theme 的消费映射

### 构建层

- `tailwind.config.cjs`
- `postcss.config.cjs`
- `ui/src/tailwind.css`

说明：

- 当前 `preflight` 关闭，避免对 Apple 风格桌面 UI 做一次性全局 reset 冲击
- 如需开启，必须伴随独立的视觉回归

### 组件层

- primitives：已 Tailwind 化
- composites：已 Tailwind 化
- overlays：已 Tailwind 化
- app shell：已脱离 `.d-*` 主结构
- domain screens：已切到 Tailwind 主路径

## 设计原则

### Tailwind 只做消费层

- 禁止在 `tailwind.config.cjs` 内维护第二套 token 真值
- 所有主题值优先从 `theme.css` 的 `--ds-*` 变量读取
- `theme.css` 是唯一视觉真值源

### 组件 API 保持稳定

- 迁移过程中优先保留原有 props 契约
- 内部实现允许切换为 Tailwind class 组合
- 尽量避免 screen 同步承担组件 API 破坏

### 清理顺序

1. 先迁移主渲染路径
2. 再迁移 screen
3. 最后删除 bridge / module.css / 旧文档说明

## 当前迁移状态

### 已完成

- Tailwind 基础设施与构建链路接入
- token 映射与主题边界收口
- primitives Tailwind 化
- composites / overlays Tailwind 化
- App shell 清退 `.d-*` 核心依赖
- Overview / Providers / Provider Workspace / Messages / Settings / Logs / screen-level overlays 迁移

### 待持续收尾

- 清理未再使用的 `*.module.css`
- 清理 `shared-bridge.css`
- 清理 `shell.css`
- 更新 `design-system/spec.ts` 中仍引用旧类名的迁移说明
- 建立新的视觉对齐基线

## 推荐约束

- 禁止新增 `.d-*` 全局类
- 禁止新增 `Component.module.css` 作为主实现
- Tailwind class 组合优先收敛在组件内部
- 业务 screen 只做结构拼装，不复制组件样式片段

## 验收方式

最小门禁：

- `npm run build`
- `cargo check --workspace`

推荐门禁：

- 关键 screen 截图对比 `designs/new.pen`
- macOS 壳层与菜单栏联动手工回归
- light / dark / compact 模式抽查
