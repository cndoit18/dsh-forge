---
version: alpha
name: DeepSeek Harness Web
description: A quiet, high-density agent workbench with neutral surfaces, functional blue accents, hairline elevation, and chat-first composition.
---

## Overview

DeepSeek Harness Web is a precision tool for sustained agent work, closer to a carefully crafted native desktop IDE than a marketing site or consumer chat app. The interface should feel calm, exact, and information-dense: chrome recedes, content remains legible, and the conversation is the visual center.

The character is **serious tooling, thoughtfully softened**. Near-black ink and neutral surfaces do most of the work. A single functional blue communicates interaction, while green, amber, and red are reserved for status and diffs. Superellipse containers, hairline edges, and diffuse shadows soften the otherwise restrained geometry.

- **Chat first:** Keep the composer visible at the bottom of the conversation column. Empty states may be spacious; working lists and tool rows stay compact.
- **Semantic color:** Never use saturated color as decoration. Blue means interaction or selection; status colors communicate meaning.
- **Quiet depth:** Define edges with a 0.5px stroke and use blur only to lift floating surfaces. Avoid heavy borders and glossy effects.
- **Bilingual clarity:** Chinese and Latin text share one system font stack. Hierarchy comes from size and weight, not additional typefaces or tracking.
- **Theme parity:** Light and dark appearances use the same semantic aliases. Switch the complete token set rather than patching individual components.

Product copy is Chinese-first, concise, precise, and low-hype. Use short verbs for actions, plain actionable errors, and compact metadata for trust signals. A poetic line is appropriate for an empty state, not for routine workflows.

## Colors

```yaml
colors:
  primary: "#0f1115"
  on-primary: "#ffffff"
  primary-hover: "#43454a"
  accent: "#4176e6"
  accent-hover: "#7aaaff"
  accent-tint: "#e4edfd"
  background: "#ffffff"
  surface: "#ffffff"
  sidebar: "#f9fafb"
  surface-subtle: "#f5f6f7"
  code-surface: "#f9fafb"
  overlay: "#e9ecf2"
  text-primary: "#0f1115"
  text-secondary: "#61666b"
  text-tertiary: "#81858c"
  placeholder: "#adb2b8"
  border-faint: "#0000000a"
  border: "#0000001a"
  border-strong: "#00000029"
  hover: "#2631480f"
  active: "#2631481a"
  nav-hover: "#f1f3f5"
  nav-active: "#ebeef2"
  user-bubble: "#edf3fe"
  selection: "color-mix(in srgb, #3b82f6 40%, transparent)"
  success: "#22c55e"
  success-tint: "#e6faed"
  warning: "#f59e0b"
  warning-tint: "#fef5e7"
  error: "#ec1313"
  error-secondary: "#f25a5a"
  diff-added: "#e6f4e7"
  diff-added-marker: "#01a241"
  diff-deleted: "#fce6e2"
  diff-deleted-marker: "#ba2723"
  mask: "#0000003d"
  mask-strong: "#0000007a"
  drop-mask: "#ffffffb3"
  photo-mask: "#000000e0"
  skeleton: "#0000000a"
  scrollbar: "#e5e5e5"
  scrollbar-hover: "#d4d4d4"
  dark-primary: "#f9fafb"
  dark-on-primary: "#0f1115"
  dark-primary-hover: "#ebeef2"
  dark-accent: "#5686fe"
  dark-link: "#7aaaff"
  dark-background: "#151517"
  dark-surface: "#2c2c2e"
  dark-sidebar: "#1b1b1c"
  dark-surface-raised: "#353638"
  dark-code-surface: "#1b1b1c"
  dark-text-primary: "#f9fafb"
  dark-text-secondary: "#cfd3d6"
  dark-text-tertiary: "#adb2b8"
  dark-border: "rgba(255, 255, 255, 0.12)"
  dark-hover: "#ffffff14"
  dark-user-bubble: "#2c2c2e"
```

Use semantic roles rather than embedding raw hex values in new components. Unprefixed tokens describe the light appearance; `dark-` tokens describe the dark appearance. In implementation, map both sets to the same component-facing aliases.

- **Primary:** {colors.primary} is both the main ink and the primary button fill, with {colors.on-primary} as its foreground. It inverts to {colors.dark-primary} with {colors.dark-on-primary} in dark mode.
- **Accent:** {colors.accent} marks links, send, selected tabs, information, and focus. Use {colors.accent-tint} for quiet selected washes. Dark mode uses {colors.dark-accent} for business emphasis and {colors.dark-link} for links and the send action.
- **Surfaces:** {colors.background} is the app frame; {colors.sidebar} and {colors.surface-subtle} separate supporting regions; {colors.surface} is reserved for cards and dialogs. Dark surfaces become lighter as their elevation increases: {colors.dark-background}, {colors.dark-surface}, then {colors.dark-surface-raised}.
- **Text:** Use {colors.text-primary} for content, {colors.text-secondary} for descriptions and icons, and {colors.text-tertiary} for metadata. Placeholder text uses {colors.placeholder}; do not use it for essential copy.
- **Interaction:** General rows and ghost controls use {colors.hover} on hover and {colors.active} when pressed. Sidebar rows instead use the opaque {colors.nav-hover} and {colors.nav-active}. Dark mode uses {colors.dark-hover}.
- **Status and diffs:** Success, warning, and error colors are meaningful, not decorative. Diff backgrounds and marker colors are paired; do not reuse them as generic UI accents.
- **Edges and overlays:** Light-mode strokes use black alpha; dark-mode strokes use {colors.dark-border}. Dialogs use {colors.mask}, with {colors.mask-strong} available for stronger modal separation. Scrims remain flat color without backdrop blur.

The user bubble is {colors.user-bubble} in light mode but becomes the neutral {colors.dark-user-bubble} in dark mode. Text selection uses {colors.selection}. Keep status tints and masks tied to their semantic roles rather than introducing additional color themes.

## Typography

```yaml
typography:
  display-empty:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 26px
    fontWeight: 500
    lineHeight: 32px
  page-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 20px
    fontWeight: 500
    lineHeight: 28px
  section-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 28px
  ui-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
  ui-label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 20px
  badge:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 10px
    fontWeight: 500
    lineHeight: 14px
  markdown-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 24px
  markdown-h1:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 21px
    fontWeight: 700
    lineHeight: 30px
  markdown-h2:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 19px
    fontWeight: 700
    lineHeight: 28px
  markdown-h3:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 18px
    fontWeight: 700
    lineHeight: 26px
  markdown-h4:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 24px
  code-inline:
    fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei", monospace'
    fontSize: 12.25px
    fontWeight: 400
    lineHeight: 19px
  code-block:
    fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei", monospace'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 19px
  code-terminal:
    fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei", monospace'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 19px
```

Use the system stack for every UI and reading surface. Montserrat is limited to the brand wordmark and falls back to the same system stack; it never enters body copy or controls. Code, terminal output, and technical literals use the monospace stack with CJK fallback.

- Keep routine UI at 13–14px. Reserve 16px for section framing and 20px or larger for genuine page or empty-state titles.
- Use weight deliberately: 400 for reading, 500 for UI hierarchy, 600 for small Markdown headings, and 700 for prominent Markdown headings.
- Chat answers default to {typography.markdown-body}. The product's font-size setting must control chat text; do not hard-code a size that bypasses it.
- Metadata and timestamps use {typography.caption}. Micro badges use {typography.badge}; do not shrink essential instructions to badge sizes.
- Keep letter spacing at the font default. Do not uppercase Chinese or Latin labels for stylistic emphasis.
- Inline code sits on a subtle chip with 8px radius and 5px horizontal padding. Fenced blocks use a quiet header, a muted surface, and 16px bottom corners.

## Layout

```yaml
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 28px
  4xl: 32px
  touch-target: 36px
  nav-row: 40px
  app-max: 1200px
  sidebar-width: 279.5px
  mobile-rail: 56px
  drag-handle: 8px
  dialog-width: 800px
```

Use an 8px rhythm with a 4px half-step for small optical adjustments. Related controls sit 8–12px apart, content groups use 16–24px, and dialog padding may reach 32px. Do not invent arbitrary intermediate spacing values.

### Workbench

On desktop, center a 1200px app frame. The workbench consists of a 279.5px sidebar, a fluid conversation column, and a collapsible right rail, with an 8px drag handle between resizable regions. The sidebar and conversation scroll independently. Keep the header and composer anchored while the conversation body scrolls.

Align content to the left, including user messages. Metadata sits above or beside titles in small secondary text. Truncate sidebar labels with ellipsis, and keep long-form chat content near a 76-character measure when space allows. Whitespace is compact inside lists but generous around the composer and empty states.

### Responsive Behavior

| Context | Reference width | Behavior |
| --- | --- | --- |
| Mobile | 390px | Collapse the sidebar to a 56px icon rail, keep 36px minimum icon targets, stack composer tools, and let dialogs become full-bleed. |
| Tablet | 768–1024px | Keep the frame fluid, narrow the sidebar where needed, and overlay or hide the right rail by default. |
| Desktop | 1280px+ | Show the centered 1200px workbench with full sidebar, fluid conversation, and collapsible right rail. |

Hide text labels before removing icons. Preserve the composer's 28px shape on small screens and keep its controls thumb-reachable. Navigation rows remain approximately 40px high; increasing touch target size must not loosen the overall spacing rhythm.

## Elevation & Depth

Depth comes from tonal layering and a signature **0.5px shadow-border**. The hairline defines the edge; soft, low-opacity shadows only communicate lift. Static content, navigation, lists, and code surfaces stay flat.

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | No shadow; transparent or subtle neutral fill | Sidebar, list rows, code blocks, attachment pills |
| Ring | `0 0 0 0.5px #00000029` | Ghost controls, icon tiles, resting inputs |
| Card | `0 0 0 0.5px #00000029, 0 4px 16px 0 #00000008, 0 0 24px 0 #00000008` | Composer and floating cards |
| Panel | `0 0 0 0.5px #00000029, 0 3px 8px 0 #00000008, 0 0 16px 0 #00000005` | Dialogs, menus, and popovers |
| Prominent | `0 0 0 0.5px #00000029, 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d` | Rare actions or surfaces requiring extra lift |
| Popover | `0 0 1px 0 #0003, 0 0 4px 0 #00000005, 0 12px 32px 0 #00000014` | Dropdowns and contextual overlays |

In dark mode, replace the black-alpha stroke with {colors.dark-border} and express hierarchy by lightening surfaces rather than strengthening shadows. Focus is not elevation: use a 2px solid accent ring without glow. Do not add backdrop blur, glassmorphism, neon shadows, or dramatic gradients.

## Shapes

```yaml
rounded:
  micro: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  panel: 28px
  full: 999px
```

Containers use `superellipse(1.5)` where supported, with the same radius values as the fallback. This produces a continuous, native-like curve without making the interface playful.

- Use {rounded.micro} only for tiny chips and badge details.
- Use {rounded.sm} for small icon buttons, pickers, and session rows.
- Use {rounded.md} for standard buttons and navigation rows.
- Use {rounded.lg} for code-block corners and plugin icon tiles.
- Use {rounded.xl} for user bubbles, plugin cards, and settings cards.
- Use {rounded.panel} for the composer and dialogs.
- Use {rounded.full} for send, compact tool actions, badges, and segmented controls.

Do not mix sharp rectangular containers into this system. Radius communicates component class; do not assign values arbitrarily.

## Components

```yaml
components:
  app:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-send:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.full}"
  button-info-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
  button-ghost-active:
    backgroundColor: "{colors.active}"
  icon-button:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    size: "{spacing.touch-target}"
  text-link:
    backgroundColor: "{colors.background}"
    textColor: "{colors.accent}"
    typography: "{typography.ui-body}"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-body}"
  nav-item-hover:
    backgroundColor: "{colors.nav-hover}"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
  attachment-pill:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.full}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sm}"
  composer-placeholder:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.placeholder}"
    typography: "{typography.ui-body}"
  user-message:
    backgroundColor: "{colors.user-bubble}"
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.xl}"
  markdown-body:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.markdown-body}"
  code-block:
    backgroundColor: "{colors.code-surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.code-block}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "{spacing.2xl}"
    width: "{spacing.dialog-width}"
  dialog-overlay:
    backgroundColor: "{colors.mask}"
  sheet:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
  badge-preview:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  activity-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.caption}"
  status-success:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success}"
  status-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
  status-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
  selection:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.text-primary}"
  diff-added:
    backgroundColor: "{colors.diff-added}"
    textColor: "{colors.diff-added-marker}"
  diff-deleted:
    backgroundColor: "{colors.diff-deleted}"
    textColor: "{colors.diff-deleted-marker}"
  skeleton:
    backgroundColor: "{colors.skeleton}"
  scrollbar:
    backgroundColor: "{colors.scrollbar}"
  scrollbar-hover:
    backgroundColor: "{colors.scrollbar-hover}"
  photo-mask:
    backgroundColor: "{colors.photo-mask}"
  drop-target:
    backgroundColor: "{colors.drop-mask}"
  dark-app:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-text-primary}"
  dark-button-primary:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  dark-button-primary-hover:
    backgroundColor: "{colors.dark-primary-hover}"
  dark-button-send:
    backgroundColor: "{colors.dark-link}"
    rounded: "{rounded.full}"
  dark-text-link:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-link}"
    typography: "{typography.ui-body}"
  dark-navigation:
    backgroundColor: "{colors.dark-sidebar}"
    textColor: "{colors.dark-text-primary}"
    typography: "{typography.ui-body}"
  dark-nav-item-hover:
    backgroundColor: "{colors.dark-hover}"
  dark-icon-button:
    textColor: "{colors.dark-text-secondary}"
    rounded: "{rounded.sm}"
    size: "{spacing.touch-target}"
  dark-composer:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-primary}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sm}"
  dark-user-message:
    backgroundColor: "{colors.dark-user-bubble}"
    textColor: "{colors.dark-text-primary}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.xl}"
  dark-code-block:
    backgroundColor: "{colors.dark-code-surface}"
    textColor: "{colors.dark-text-primary}"
    typography: "{typography.code-block}"
    rounded: "{rounded.lg}"
  dark-dialog:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.panel}"
    padding: "{spacing.2xl}"
    width: "{spacing.dialog-width}"
  dark-toast:
    backgroundColor: "{colors.dark-surface-raised}"
    textColor: "{colors.dark-text-primary}"
  dark-activity-row:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-tertiary}"
    typography: "{typography.caption}"
```

### Buttons and Links

Primary buttons use 8px vertical and 12px horizontal padding, a 12px radius, and a 0.1s background-color transition. Keep one visually dominant commitment per region. The send action is a compact accent pill around its arrow icon, not a second full-width primary button.

Ghost and icon controls stay transparent until interaction. Use the universal wash for hover and pressed states. Icon artwork is 13–16px inside a minimum 36px hit area. Links have no underline at rest; on hover, use a dotted underline with a 3px offset.

### Composer and Messages

The composer is the signature floating container: 28px superellipse corners, a white or dark raised surface, 8px internal padding, a borderless 14px input, and a quiet row of pill-shaped tools. Its hairline edge turns accent blue on `focus-within`; do not put a second boxed input inside it.

User messages remain left-aligned in the conversation flow, with 20px corners and 10px vertical by 16px horizontal padding. Do not mirror them to the right or give them heavy shadows. Agent answers use the Markdown hierarchy and 14px/24px default rhythm. Activity rows collapse tool metadata into compact 12px tertiary text and expand inline.

### Navigation, Cards, and Dialogs

Navigation rows use 14px text and 12px corners; nested session rows use 8px corners. The selected state is a solid neutral or accent tint, not a heavy border. The sidebar contains the brand row, new-session action, primary navigation, workspace/session groups, and account controls without adding decorative panels.

Cards use the ring or card elevation as appropriate. Dialogs use the 28px panel shape, 24–32px content padding, and a flat scrim. Trap keyboard focus inside dialogs and place initial focus on the heading or first meaningful control. Settings cards remain quieter than dialogs and use 20px corners.

### Controls, Feedback, and Media

Tabs, switches, checkboxes, and copyable blocks receive a 2px accent `focus-visible` ring. Switches and checked controls use the accent when on. Scrollbars stay thin and neutral. Skeletons use a subtle base with a slow gradient sweep; avoid celebratory loading animation.

Icons are thin-stroke SVGs in secondary gray, with 16px-radius tiles for plugin artwork. Diff images and rows use the defined green/red markers. Photo and drop masks are reserved for their respective media interactions.

Motion is functional and brief: 0.1s for hover feedback and 0.2–0.3s for state or content transitions, using `cubic-bezier(.4,0,.2,1)`. Accordions may animate height; icons may cross-fade on hover. Nothing should bounce, overshoot, or animate decoratively. Respect reduced-motion preferences by removing nonessential transitions.

## Do's and Don'ts

- **Do** make the conversation and composer the center of the layout.
- **Do** use the 8px spacing rhythm and the defined radius ladder.
- **Do** reserve blue for interaction, selection, links, information, and focus.
- **Do** use a 0.5px hairline with soft shadows instead of heavy card borders.
- **Do** keep routine UI at 13–14px and long-form chat at the configurable Markdown size.
- **Do** verify hover, pressed, selected, focus-visible, disabled, light, and dark states for every interactive component.
- **Do** preserve at least 36px icon targets and 40px navigation rows on touch layouts.
- **Don't** introduce decorative gradients, glassmorphism, glows, or saturated accent colors.
- **Don't** right-align user messages or turn the interface into a consumer chat layout.
- **Don't** add another UI typeface, custom tracking, or arbitrary font sizes.
- **Don't** hard-code light-only colors or repair dark mode component by component; switch semantic tokens as a set.
- **Don't** use long or celebratory motion, and never let animation delay work.
