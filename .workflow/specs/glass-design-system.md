# MaDao Glass Design System Specification
version: 1.0  
date: 2026-05-07  
status: canonical — use this as reference for all UI development

---

## Core Concept

macOS Glass App aesthetic. Every surface is a frosted glass panel floating over a blue-gray desktop. Depth comes from layered translucency, not flat colors.

---

## Background System

```
Level 0 — Desktop (window/body)   #e8ecf0     solid, the "wallpaper"
Level 1 — Sidebar / Toolbar       rgba(255,255,255,0.60) + blur(20px)
Level 2 — Cards / Panels          rgba(255,255,255,0.70) + blur(20px)
Level 3 — Modals / Sheets         rgba(255,255,255,0.92) + blur(20px)
Level 4 — Inputs (crisp, not glass)  rgba(255,255,255,0.85)  no blur
```

**Dark mode** (same hierarchy, different tint):
```
Level 0   #1a1a1c
Level 1   rgba(40,40,44,0.75) + blur(20px)
Level 2   rgba(44,44,48,0.80) + blur(20px)
Level 3   rgba(52,52,56,0.92) + blur(20px)
```

---

## Color Tokens (theme.css canonical values)

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-color-window-bg` | `#e8ecf0` | html/body/root background |
| `--ds-color-sidebar-bg` | `rgba(255,255,255,0.60)` | sidebar glass |
| `--ds-color-content-bg` | `#e8ecf0` | main content area (same as window) |
| `--ds-color-surface-default` | `rgba(255,255,255,0.70)` | card/panel glass |
| `--ds-color-surface-subtle` | `rgba(255,255,255,0.45)` | secondary surface, table headers |
| `--ds-color-border-default` | `rgba(0,0,0,0.08)` | within-card dividers, subtle borders |
| `--ds-color-border-strong` | `rgba(0,0,0,0.15)` | input borders, strong separators |
| `--ds-color-text-primary` | `#1d1d1f` | unchanged |
| `--ds-color-text-secondary` | `#6e6e73` | unchanged |
| `--ds-color-accent-blue` | `#007AFF` | Apple Blue (upgraded from #0066cc) |
| `--ds-color-accent-blue-focus` | `#007AFF` | same as accent |
| `--ds-color-accent-blue-soft` | `rgba(0,122,255,0.10)` | soft accent bg |
| `--ds-color-state-success` | `#27c93f` | unchanged |
| `--ds-color-state-success-soft` | `#eaf9ec` | unchanged |

### Effect Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-effect-backdrop-blur` | `20px` | glass blur strength |
| `--ds-effect-shadow-default` | `0 2px 8px rgba(0,0,0,0.06)` | card ambient shadow |
| `--ds-effect-shadow-modal` | `0 8px 40px rgba(0,0,0,0.14), 0 0 0 0.5px rgba(255,255,255,0.5)` | modal lift + glass edge |

---

## Component Patterns

### Glass Card (standard content card)
```tsx
<div className="rounded-2xl border border-ds-border bg-ds-surface backdrop-blur-ds shadow-ds">
```
- Background: `rgba(255,255,255,0.70)` from token
- Blur: `blur(20px)` from `backdrop-blur-ds`
- Border: subtle `rgba(0,0,0,0.08)` 
- Shadow: `0 2px 8px rgba(0,0,0,0.06)`

### Glass Sidebar
```tsx
<aside className="bg-ds-sidebar backdrop-blur-ds border-r border-ds-border">
```
- Background: `rgba(255,255,255,0.60)`

### Glass Toolbar
```tsx
<header className="bg-ds-content backdrop-blur-ds border-b border-ds-border">
```
- Background: `#e8ecf0` (solid, no blur needed — it's at desktop level)
- OR keep `bg-ds-content` which equals window-bg

Actually toolbar pattern: same as content bg. Just ensure sticky z-index puts it above cards.

### Modal
```tsx
<div className="rounded-[12px] border border-ds-border bg-ds-surface backdrop-blur-[20px] shadow-modal">
```
- Background: set surface to `rgba(255,255,255,0.92)` for modals (they get their own override class)
- Actually modals should just use `bg-white/[.92] backdrop-blur-[20px]` since `bg-ds-surface` is panel-level (0.70)

Better pattern for modals:
```tsx
<div className="rounded-[12px] border border-ds-border bg-white/[.92] backdrop-blur-[20px] shadow-modal">
```

### Segmented Control (rail)
```tsx
<div className="inline-flex ... rounded-[8px] border border-ds-border bg-ds-surface-subtle backdrop-blur-[12px] p-1">
```
- Track: `rgba(255,255,255,0.45)` + light blur
- Selected item: `bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.10)]`

### Form Inputs
```tsx
<input className="border border-ds-border-strong bg-white/85 rounded-xl px-4 py-[11px]">
```
- No backdrop-blur — inputs are crisp, solid
- Background: near-opaque white
- Border: dark `rgba(0,0,0,0.15)`

### Status Badges (pill/chip)
- Connected/Enabled (green): `bg-ds-state-successSoft text-ds-state-success`
- Standby/Disabled (gray): `bg-ds-surface-subtle text-ds-text-secondary`
- Protocol/service badge (blue): `bg-ds-accent-soft text-ds-accent-blue`

---

## Typography (unchanged)

Two title tiers for headings:

| Context | Size | Weight | Tracking |
|---------|------|--------|---------|
| Main nav pages (Overview/Messages/Settings/Logs) | 28px | 600 | +0.196px |
| Workspace/sub-pages (Routing Detail, Providers Config) | 22px | 700 | -0.3 |

Page subtitle text: 13px, `text-ds-text-secondary`, opacity 0.55

---

## Accent Color: `#007AFF`

All interactive elements use `#007AFF` Apple Blue:
- Primary buttons: `bg-[#007AFF] text-white rounded-full`
- Links/chevrons: `text-ds-accent-blue`
- Active nav items: `text-ds-accent-blue`
- Toggle switch (on): `#007AFF`
- Tab underline (active): `border-ds-accent-blue`

---

## Backdrop Blur Rules

| Surface | Blur | Why |
|---------|------|-----|
| Sidebar | 20px (`backdrop-blur-ds`) | Level 1 glass |
| Cards/Panels | 20px (`backdrop-blur-ds`) | Level 2 glass |
| Modal | 20px (`backdrop-blur-[20px]`) | Level 3 glass |
| Segmented track | 12px | Subtle control glass |
| Toolbar | none | Solid surface (same as desktop bg) |
| Inputs | none | Crisp controls |

**Critical**: backdrop-blur only produces visible effect when the element has a semi-transparent background. If background is opaque (white), blur has no visual effect.

---

## Tailwind Quick Reference

```
bg-ds-window        → #e8ecf0 (desktop bg)
bg-ds-sidebar       → rgba(255,255,255,0.60) (sidebar glass)
bg-ds-content       → #e8ecf0 (content area = desktop)
bg-ds-surface       → rgba(255,255,255,0.70) (card glass)
bg-ds-surface-subtle→ rgba(255,255,255,0.45) (secondary surface)
border-ds-border    → rgba(0,0,0,0.08) (subtle dividers)
border-ds-border-strong → rgba(0,0,0,0.15) (input borders)
text-ds-accent-blue → #007AFF
backdrop-blur-ds    → blur(20px)
shadow-ds           → 0 2px 8px rgba(0,0,0,0.06)
shadow-modal        → 0 8px 40px rgba(0,0,0,0.14), ...
```

---

## Dark Mode Notes

Dark mode uses the same component patterns. Background tokens shift to dark values. The `[data-theme="dark"]` overrides in theme.css handle all of this automatically. Do not add separate dark: Tailwind variants unless absolutely necessary.

---

## What NOT to do

- ❌ Opaque white cards on blue-gray bg (looks flat, not glass)
- ❌ `bg-ds-surface` without `backdrop-blur-ds` (glass needs blur to activate)
- ❌ Heavy `rgba(0,0,0,0.12)` borders on glass cards (too dark, disrupts translucency)
- ❌ `#0066cc` as accent (not Apple Blue, lower vibrancy)
- ❌ Inputs with `backdrop-blur` (inputs should be crisp, not frosted)
- ❌ Pure white `#ffffff` backgrounds (opaque, not glass)
