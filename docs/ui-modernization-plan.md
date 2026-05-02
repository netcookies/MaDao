# UI 现代化重构方案

## 结论

针对当前 `React + 单文件组件 + 单份大 CSS` 的结构，最稳妥的现代化方案不是直接上运行时 CSS-in-JS，而是：

1. 保留 React 19。
2. 引入 `design token + component contract` 作为单一事实源。
3. 采用 `CSS Modules + CSS Variables + cascade layer` 做样式分层。
4. 按 `primitive → shell → domain screen` 顺序迁移。

这样做的原因：

- 不增加运行时样式成本。
- 与 Vite 原生兼容。
- 适合当前仓库没有额外前端基础设施的现实。
- 能在不大改业务逻辑的前提下逐步拆掉 `App.tsx`。

## 目标架构

### 1. 设计系统层

- `ui/src/design-system/tokens.ts`
  - 导出 JS 可读 token。
- `ui/src/design-system/theme.css`
  - 导出 CSS 变量。
- `ui/src/design-system/spec.ts`
  - 导出组件规范与迁移映射。

### 2. Primitive 层

目录建议：

```text
ui/src/components/primitives/
├── Button/
├── IconButton/
├── SegmentedControl/
├── SearchField/
├── SelectTrigger/
├── ToggleSwitch/
├── SurfaceCard/
└── StatusPill/
```

每个 primitive 目录建议包含：

```text
Component.tsx
Component.module.css
Component.types.ts
index.ts
```

### 3. Composite 层

- `AppSidebar`
- `AppToolbar`
- `PageHeader`
- `SectionHeader`
- `DataTable`
- `NotificationPopover`
- `Modal`

### 4. Domain 层

- `providers/`
- `messages/`
- `settings/`
- `logs/`

每个 domain 目录只保留：

- 业务视图组合
- domain hook
- domain formatter

不再在 domain 内定义基础按钮与通用表单控件。

## 样式分层

建议把样式分为 4 层：

### Layer 1：Tokens

- 只放 `:root` 变量与 `[data-theme="dark"]` 覆盖
- 不出现任何组件选择器

### Layer 2：Reset / Base

- `box-sizing`
- `html/body/#root`
- `button/input` 字体继承
- `focus-visible` 基础策略

### Layer 3：Primitives

- Button
- Input
- Card
- Badge
- Toggle

### Layer 4：Screens

- 页面布局
- 局部响应式
- domain 组合关系

这样可以避免现在这种问题：

- token 与业务样式混写
- 页面局部调整反向污染全局 primitive
- 一个类名承担多种语义

## 状态管理拆分

当前 `App.tsx` 的问题不只是样式，还包括状态聚合过重。

建议把状态拆为：

### app shell state

- `activeScreen`
- `providerView`
- `activeProviderSection`
- `showNotifications`
- `showActivationModal`

### settings state

- `appearanceTheme`
- `language`
- `compactTables`
- `runtimeSettings`

### data state

- `snapshot`
- `manifests`
- `balances`
- `pricePanels`
- `providerOptions`

### transient ui state

- `selectorState`
- `selectorSearch`
- `busyAction`
- `statusMessage`

建议迁移到：

- `hooks/useAppShellState.ts`
- `hooks/useRuntimeData.ts`
- `hooks/useProviderWorkspace.ts`
- `hooks/useNotifications.ts`

## 迁移步骤

### Phase 0：抽 token 与规范

- 建立 `design-system/spec.ts`
- 建立 `design-system/tokens.ts`
- 建立 `theme.css`

这是当前已完成或可立即承接的阶段。

### Phase 1：抽 primitive

优先级：

1. `Button`
2. `SegmentedControl`
3. `SearchField`
4. `SelectTrigger`
5. `ToggleSwitch`
6. `SurfaceCard`

迁移策略：

- 新建组件
- 用少量适配层兼容旧页面
- 不一次性替换全部 screen

### Phase 2：抽 shell

优先级：

1. `AppSidebar`
2. `AppToolbar`
3. `PageHeader`
4. `NotificationPopover`
5. `Modal`

### Phase 3：按页面拆 `App.tsx`

建议拆分顺序：

1. `SettingsScreen`
2. `LogsScreen`
3. `MessagesScreen`
4. `ProvidersListScreen`
5. `ProviderWorkspaceScreen`
6. `OverviewScreen`

这个顺序的原因：

- Settings / Logs 的业务耦合最小。
- Provider Workspace 最复杂，最后拆更安全。

## 推荐的现代化约束

### 组件 API

- variant 用显式 union type
- size 用显式 union type
- tone / status 用语义枚举
- 禁止传入任意 className 改写核心结构，除过渡期外仅保留 `className` 做外层挂载

### 样式策略

- 禁止新增 `.d-*` 全局类作为长期方案
- 优先 `data-variant`、`data-size`、`data-state`
- 禁止业务组件直接依赖颜色值
- 禁止同一个组件跨多个页面复制 CSS 片段

### 业务与视觉解耦

- 把 `formatServiceLabel`、`formatProviderLabel`、`formatCountryLabel` 移到 formatter
- 把 `busyAction` 拆成显式布尔状态或 action map
- 把调试或验收专用适配逻辑收敛到独立模块

## 风险点

### 1. 当前热文件已有未提交修改

以下文件已经有在途变更：

- `ui/src/App.tsx`
- `ui/src/styles.css`
- `designs/new.pen`

因此结构性重构不能直接在这些文件上继续叠加，否则会与现有工作流冲突。

### 2. 当前没有前端测试基础设施

现状没有 Vitest / Testing Library。

建议后续补充：

- `vitest`
- `@testing-library/react`
- `@testing-library/user-event`

至少覆盖：

- primitive 组件渲染
- variant / size / disabled / active 状态
- overlay 开关
- formatter 纯函数

## 下一步建议

如果继续推进代码落地，建议单独开一轮只处理 UI 重构，并遵循下面顺序：

1. 先清理或合并当前 `App.tsx` / `styles.css` 的未提交修改。
2. 接入 design-system token 文件。
3. 落第一批 primitive。
4. 用 `SettingsScreen` 作为首个迁移试点。
5. 每迁移一屏都跑截图对比。
