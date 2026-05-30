# UI 组件设计规范

> **Status: Active** — 当前生效的组件约束。视觉真值仍来自 `DESIGN.md` 和 `ui/src/design-system/theme.css`。

## 目标

本规范描述当前 `Tailwind + design token` 架构下的组件边界与约束。视觉真值仍来自：

- `DESIGN.md`
- `designs/new.pen`
- `ui/src/design-system/theme.css`

Tailwind 只是这些 token 的消费层。

## 样式体系

### 单一事实源

- 颜色、圆角、间距、字体、动效：`ui/src/design-system/theme.css`
- Tailwind theme 映射：`ui/src/design-system/tailwind-theme.cjs`

### 运行时消费层

- `tailwind.config.cjs`
- `ui/src/tailwind.css`
- 组件内部 Tailwind class 组合

### 兼容层

- `ui/src/base.css`
  - reset
  - legacy alias

## 分层

### Primitives

- `Button`
- `IconButton`
- `SearchField`
- `SegmentedControl`
- `SelectTrigger`
- `StatusPill`
- `SurfaceCard`
- `ToggleSwitch`

要求：

- 内部使用 Tailwind
- 外部 props 尽量稳定
- variant / size / state 使用显式 union

### Composites

- `AppShell`
- `AppSidebar`
- `AppToolbar`
- `DataTable`
- `PageHeader`
- `SectionHeader`

要求：

- 负责结构组合
- 不承载业务状态
- 不再依赖旧 `.d-*` 类名作为主方案

### Overlays

- `Modal`
- `NotificationPopover`

要求：

- 统一 panel / backdrop / header / footer 结构
- screen-level 业务弹层在 app 层二次组合

### Domain Screens

- `OverviewScreen`
- `ProvidersListScreen`
- `ProviderWorkspaceScreen`
- `MessagesScreen`
- `SettingsScreen`
- `LogsScreen`

要求：

- 负责业务视图拼装
- 优先复用 primitives/composites/overlays
- 不再把 `shared-bridge.css` 作为核心布局来源

## Token 消费规则

### 颜色

- 使用 `text-ds-*`、`bg-ds-*`、`border-ds-*`
- 避免在 screen 层散落裸 `hex`

例外：

- macOS traffic lights 等平台拟物细节

### 间距与尺寸

- 优先复用 `ds-*` spacing / size token
- screen 层非 token 值只允许出现在少量视觉微调

### 字体

- 页面标题：`text-page-title`
- 区块标题：`text-section-title`
- 正文：`text-body`
- utility 文案：`text-utility`
- caption：`text-caption`

## 迁移后约束

- 禁止新增 `.d-*` bridge class
- 禁止新增 `Component.module.css` 作为主实现
- 禁止在 Tailwind config 中复制第二套 token 真值
- 优先在组件内部收敛 Tailwind class，不把复杂 class 串扩散到 screen

## 剩余清理项

- 删除未再使用的 `*.module.css`
- 删除 `shared-bridge.css`
- 删除 `shell.css`
- 更新 `design-system/spec.ts` 中仍引用旧类名的描述
