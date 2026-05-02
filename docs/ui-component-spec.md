# UI 组件设计规范

## 目标

本规范基于以下设计源与现状实现抽取，用于下一步把当前单文件视图与纯 CSS 拆解为可维护的 React component：

- 设计源：`designs/new.pen`
- 当前实现：`ui/src/App.tsx`、`ui/src/styles.css`

本次抽取遵循两个原则：

1. 先定义稳定的设计 token 与组件边界，再做代码迁移。
2. 组件规范以当前桌面端 Tauri UI 为准，不直接照搬 `DESIGN.md` 中的 Apple 官网组件命名。

## 设计 Token

### 颜色

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `color.window.bg` | `#f5f5f7` | `#1c1c1e` | 整体窗口背景 |
| `color.sidebar.bg` | `#f6f6f6` | `#232325` | 左侧导航 |
| `color.content.bg` | `#f5f5f7` | `#232325` | 主内容区域 |
| `color.surface.default` | `#ffffff` | `#2c2c2e` | 卡片、弹层主体 |
| `color.surface.subtle` | `#fafafc` | `#3a3a3c` | 次级容器、代码框、电话 pill |
| `color.surface.chip` | `#d2d2d7` | `#48484a` | 图标按钮底 |
| `color.border.default` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` | 常规边框 |
| `color.border.strong` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.15)` | 输入、分段控件 |
| `color.text.primary` | `#1d1d1f` | `#f5f5f7` | 主文案 |
| `color.text.secondary` | `#6e6e73` | `rgba(245,245,247,0.55)` | 辅助文案 |
| `color.accent.blue` | `#0066cc` | `#3d9dff` | 主操作 |
| `color.accent.blueFocus` | `#0071e3` | `#409cff` | 焦点与高亮 |
| `color.state.success` | `#27c93f` | `#30d158` | 成功态 |
| `color.state.warning` | `#ff9500` | `#ff9f0a` | 等待态 |
| `color.state.danger` | `#ff5f56` | `#ff453a` | 错误态 |

### 圆角

| Token | 值 | 用途 |
| --- | --- | --- |
| `radius.xs` | `5px` | 小 badge / code box |
| `radius.sm` | `8px` | nav item、utility button、rail segment |
| `radius.md` | `11px` | provider tab、中等容器 |
| `radius.lg` | `18px` | card、panel、modal |
| `radius.pill` | `9999px` | primary button、search、status pill |

### 间距

| Token | 值 |
| --- | --- |
| `space.xxs` | `4px` |
| `space.xs` | `8px` |
| `space.sm` | `12px` |
| `space.md` | `17px` |
| `space.lg` | `24px` |
| `space.xl` | `32px` |
| `space.xxl` | `48px` |

### 尺寸

| Token | 值 | 用途 |
| --- | --- | --- |
| `size.window.width` | `1024px` | 设计稿桌面宽度 |
| `size.window.height` | `768px` | 设计稿桌面高度 |
| `size.sidebar.width` | `240px` | 左侧栏 |
| `size.toolbar.height` | `52px` | 顶部工具栏 |
| `size.control.default` | `44px` | 主按钮、输入框最小高度 |
| `size.control.compact` | `32px` | utility button / compact input |
| `size.panel.notification.width` | `320px` | 通知面板 |
| `size.modal.activation.width` | `480px` | 激活弹窗 |

### 字体

| Token | 样式 | 用途 |
| --- | --- | --- |
| `type.display.page` | `34 / 1.12 / 600 / -0.374px` | 页面一级标题 |
| `type.title.section` | `21 / 1.19 / 600 / 0.231px` | 区块标题、toolbar title |
| `type.body.default` | `17 / 1.47 / 400 / -0.374px` | 默认正文 |
| `type.body.strong` | `17 / 1.24 / 600 / -0.374px` | 电话、关键数据 |
| `type.utility.default` | `14 / 1.29 / 400 / -0.224px` | utility button、select、细节文案 |
| `type.utility.strong` | `14 / 1.29 / 600 / -0.224px` | rail segment、字段 label |
| `type.caption` | `12 / 1.43 / 400 / -0.224px` | nav item、状态说明 |
| `type.caption.strong` | `12 / 1 / 600 / 0.12em` | 统计卡 label |

### 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `motion.transition.fast` | `180ms ease` | 颜色、边框、透明度变化 |
| `motion.press.scale` | `0.95` | 建议统一按压态 |
| `motion.spin.default` | `1turn` | loading 图标 |

## 组件清单

### 1. AppShell

- 角色：桌面容器，负责 `Sidebar + MainArea` 两列布局。
- 设计来源：`xAOQW`、`56BG9`、`7PXST` 等顶层 frame。
- 当前实现：
  - 结构：`App`
  - 样式：`.mac-window`、`.d-main`、`.d-content`
- 规范：
  - 左列固定 `240px`
  - 右列自适应
  - 主体背景使用 `color.content.bg`

### 2. AppSidebar

- 角色：全局导航容器。
- 设计来源：可复用组件 `vMhdP` `Sidebar Component`
- 当前实现：
  - 结构：`App`
  - 样式：`.d-sidebar`、`.d-traffic`、`.d-nav`
- 子组件：
  - `TrafficLights`
  - `SidebarNav`
  - `SidebarNavItem`
- 变体：
  - `default`
  - `active`

### 3. AppToolbar

- 角色：顶部上下文导航与右侧操作区。
- 设计来源：可复用组件 `rlf7R` `Toolbar Component`
- 当前实现：
  - 结构：`App`
  - 样式：`.d-toolbar`、`.d-toolbar-left`、`.d-toolbar-right`
- 子组件：
  - `ToolbarBackButton`
  - `ToolbarTitle`
  - `NotificationTrigger`
  - `PrimaryToolbarAction`

### 4. PageHeader

- 角色：页面内容区顶部标题栏。
- 当前实现：
  - 结构：`PageHeader`
  - 样式：`.d-page-header`、`.d-page-title-block`、`.d-h1`、`.d-subtitle`
- 变体：
  - `default`
  - `center`

### 5. SurfaceCard

- 角色：所有白色或深色面板的基础容器。
- 当前实现：
  - 结构：大量 screen / modal 内部 section
  - 样式：`.d-card`、`.d-balance-card`、`.d-form-card`、`.d-act-card`
- 规范：
  - 背景 `color.surface.default`
  - 边框 `color.border.default`
  - 圆角 `radius.lg`
  - 不使用投影作为常态层级

### 6. StatCard

- 角色：概览页三列统计卡片。
- 当前实现：
  - 结构：`StatCard`
  - 样式：`.d-stat-card`、`.d-stat-label`、`.d-stat-value`
- 组成：
  - 标题 label
  - 数值
  - 趋势 caption

### 7. Button

- 角色：统一操作按钮体系。
- 当前实现：
  - 结构：`AppButton`
  - 样式：`.d-btn-primary`、`.d-btn-outline`、`.d-btn-success`、`.d-btn-ghost`、`.d-btn-text`
- 变体：
  - `primary`
  - `outline`
  - `success`
  - `ghost`
  - `dangerOutline`
  - `text`
- 尺寸：
  - `default`
  - `utility`
  - `compact`

### 8. IconButton

- 角色：图标触发器。
- 当前实现：
  - 样式：`.d-icon-btn`、`.d-icon-btn-toolbar`
- 变体：
  - `surface`
  - `toolbar`

### 9. SegmentedControl

- 角色：同级选项切换。
- 当前实现：
  - 结构：`SegmentedControl`
  - 样式：`.d-seg-tabs`、`.d-seg-tab`
- 变体：
  - `pill`
  - `rail`

### 10. SelectTrigger

- 角色：只负责展示当前值并打开选择器。
- 当前实现：
  - 结构：`SelectTrigger`
  - 样式：`.d-select-display`、`.d-select-button`
- 变体：
  - `default`
  - `compact`
  - `prominent`
  - `disabledLook`

### 11. SearchField

- 角色：统一搜索输入外观。
- 当前实现：
  - 结构：`SearchField`
  - 样式：`.d-search-bar`
- 组成：
  - leading icon
  - input

### 12. ToggleSwitch

- 角色：二元开关。
- 当前实现：
  - 结构：`ToggleSwitch`
  - 样式：`.d-toggle`、`.d-toggle-thumb`
- 宿主行组件：
  - `ToggleSetting`
  - `d-toggle-row`

### 13. StatusBadge / StatusPill

- 角色：表达 provider / ticket 当前状态。
- 当前实现：
  - 结构：`StatusBadge`、`StatusPill`
  - 样式：`.d-badge`、`.d-status-pill`
- 语义色：
  - `success`
  - `warning`
  - `muted`

### 14. DataTable

- 角色：表头 + 行容器。
- 当前实现：
  - 结构：`DataTable`
  - 样式：`.d-table`、`.d-table-row`、`.d-table-header`
- 约束：
  - 行结构必须稳定
  - 排序、筛选、紧凑模式不应由样式类直接耦合业务组件

### 15. ActivityCard

- 角色：消息激活记录卡片。
- 当前实现：
  - 结构：`MessagesScreen`
  - 样式：`.d-act-card`、`.d-act-phone-pill`、`.d-code-area`
- 子区域：
  - Header
  - Phone pill
  - Code state
  - Footer actions

### 16. NotificationPopover

- 角色：顶部 bell 的通知浮层。
- 设计来源：`v71IQ` `Notification Panel — Popover`
- 当前实现：
  - 结构：`App`
  - 样式：`.d-notification-panel`、`.d-notification-item`
- 子组件：
  - `NotificationHeader`
  - `NotificationList`
  - `NotificationItem`
  - `NotificationFooter`

### 17. Modal

- 角色：所有遮罩弹窗的基础外壳。
- 当前实现：
  - 样式：`.d-backdrop`、`.d-modal`
- 变体：
  - `activation`
  - `wide`
  - `selector`

### 18. NewActivationModal

- 角色：新建激活流程。
- 设计来源：`UE0DB` `Modal — New Activation`
- 当前实现：
  - 结构：`NewActivationModal`
  - 样式：`.d-modal-activation`、`.d-activation-form`、`.d-modal-footer-activation`
- 子组件：
  - `ModalField`
  - `ActivationPriceRange`
  - `ActivationSubmitRow`

### 19. ManifestModal

- 角色：高级 manifest 原始 JSON 编辑。
- 当前实现：
  - 结构：`ManifestModal`
- 特点：
  - 宽版 modal
  - 上方说明 + 下方代码编辑区

### 20. SearchSelectorModal

- 角色：大列表选择器。
- 当前实现：
  - 结构：`SearchSelectorModal`
  - 样式：`.d-selector-search-wrap`、`.d-selector-list`、`.d-selector-item`

## 页面级组合

### Overview

- `PageHeader`
- `StatCard[]`
- `SurfaceCard(RecentActivity)`
- `DataTable`

### Providers

- `PageHeader`
- `SurfaceCard(ProviderList)`
- `DataTable`

### Provider Workspace

- `SectionHeader`
- `SegmentedControl / ProviderTab`
- `WorkspaceConfig | WorkspaceStore | WorkspaceWallet`

### Messages

- `PageHeader`
- `SegmentedControl(rail)`
- `ActivityCard[]`

### Settings

- `PageHeader`
- `SurfaceCard`
- `SettingChoiceRow`
- `ToggleSetting`

### Logs

- `PageHeader`
- `SegmentedControl(rail)`
- `SearchField`
- `SurfaceCard(LogTable)`

## 当前代码的主要耦合点

1. `App.tsx` 同时持有：
   - 数据拉取
   - 交互状态
   - 组件定义
   - 页面组合
   - 样式语义映射

2. `styles.css` 同时承担：
   - token 定义
   - layout
   - primitive
   - domain component
   - page override
   - responsive
   - theme

3. 视觉变体通过类名横向扩散：
   - 例如 button、select、segmented、modal、notification、activity card
   - 同一类名既表达外观，又隐含业务上下文

## 组件抽取优先级

### P0：先抽基础 primitive

- `Button`
- `IconButton`
- `SegmentedControl`
- `SelectTrigger`
- `SearchField`
- `ToggleSwitch`
- `SurfaceCard`

### P1：再抽 shell 与 overlay

- `AppShell`
- `AppSidebar`
- `AppToolbar`
- `NotificationPopover`
- `Modal`

### P2：最后抽 domain component

- `ProviderList`
- `ProviderWorkspace`
- `ActivityCard`
- `RuntimeSettingsPanel`
- `ManifestEditorPanel`

## 推荐目录结构

```text
ui/src/
├── app/
│   ├── shell/
│   ├── providers/
│   ├── messages/
│   ├── settings/
│   └── logs/
├── components/
│   ├── primitives/
│   ├── composites/
│   └── overlays/
├── design-system/
│   ├── spec.ts
│   ├── tokens.ts
│   └── theme.css
├── hooks/
├── services/
└── state/
```

## 迁移约束

- 先迁移 primitive，再迁移页面。
- 新组件不直接复用 `.d-*` 命名作为长期 API，只允许在过渡层映射。
- 业务状态与视觉样式解耦，避免 `busyAction.includes('prices')` 这种 UI 直接解析业务字符串。
- 任何新样式都要优先走 token，不再新增散落的硬编码颜色与尺寸。
