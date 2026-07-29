---
name: responsive-layout
description: Make layouts work across widths, zoom levels, input types and content lengths — breakpoints, container queries, intrinsic sizing, space reservation, touch targets. Load when building or reviewing any layout.
---

# Responsive layout

Responsive is not a list of breakpoints. It is a set of decisions about what changes, when, and why.

## Design from the constraints, not the mockup width

The mockup is 1440px. The users are not. The four conditions that break most layouts:
1. **320px wide** — the narrowest width WCAG reflow requires support for.
2. **200% browser zoom** — an accessibility requirement, and it behaves like a narrow viewport with large text. This is the one nobody tests.
3. **The longest realistic content**, not the mockup's short label.
4. **A different font size** — a user with a 20px browser default, or a language whose words are 40% longer.

## Intrinsic sizing before media queries

Most "responsive" work needs no breakpoint at all. Let content determine size:
- `flex-wrap` with a `min-width` on items — they reflow when they no longer fit, at the width where it actually matters rather than an arbitrary one.
- `grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr))` — a grid that adapts its column count with no media query.
- `min()`, `max()`, `clamp()` for fluid sizing — `clamp(1rem, 2.5vw, 2rem)` scales type without steps.
- `min-width: 0` on flex children when text must be allowed to shrink — the default `min-width: auto` is why long text overflows a flex container instead of truncating.

A layout built this way survives content lengths you did not anticipate. A breakpoint-driven layout only handles the widths you enumerated.

## Container queries where the component is reused at different sizes

A card in a sidebar and the same card in a main grid want different layouts at the *same viewport width*. That is what container queries are for, and it is the case media queries genuinely cannot express. If the repo supports them, prefer them for reusable components — the component then works wherever it is placed instead of assuming a page context.

## Breakpoints, when you do need them

- Derive them from **where the content breaks**, not from device names. Devices change; the width where your three-column grid stops working does not.
- Use the repo's existing scale. A one-off `@media (max-width: 812px)` in one component diverges from every other component silently.
- **Mobile-first** (`min-width` queries) tends to produce less code and fewer overrides, and matches how the base styles should read.

## Reserve space for everything that loads late

This is the direct, mechanical cause of layout shift:
- **Images and video**: `width`/`height` attributes or an `aspect-ratio`. The browser then reserves the box before the file arrives.
- **Async content**: a skeleton with the **final dimensions**, not a smaller placeholder that grows.
- **Fonts**: `font-display: swap` plus a fallback whose metrics are close (`size-adjust`, `ascent-override`) so the swap does not reflow.
- **Never inject content above existing content** — a banner that appears at the top after load pushes everything the user was reading.

## Touch and pointer

- **Target size at least 24×24 CSS px** (WCAG 2.2 AA); 44×44 is the comfortable standard. Include padding — a 16px icon in a 44px button is fine.
- **Spacing between adjacent targets** matters as much as size; adjacent 44px targets with no gap still produce mis-taps.
- **Hover-only affordances do not exist on touch.** A menu that opens on hover, an action revealed on row hover, a tooltip carrying essential information — each needs a tap/focus equivalent.
- `@media (hover: hover)` and `(pointer: coarse)` let you branch on capability rather than guessing from width.

## Overflow: decide, do not discover

For each region that can overflow, pick one and implement it: **truncate** (with the full value reachable via `title`, tooltip, or expansion), **wrap**, or **scroll** (with the scroll container clearly bounded).

Never allow the **page body** to scroll horizontally. A wide element — a table, a code block, a chart — scrolls inside its own `overflow-x: auto` container, not by widening the document.

## Safe areas and viewport units

- `env(safe-area-inset-*)` for notches and home indicators, if the app runs full-bleed on mobile.
- `100vh` is wrong on mobile browsers, where the toolbar shrinks and grows: use `100dvh` (or a small/large-viewport unit) for anything meant to be exactly one screen.

## Verify by looking

```
320px · 768px · 1024px · 1440px · 200% zoom · longest content · RTL if supported
```
Screenshot each. The visual auditor's harness does this; if none exists, do it manually and say you did. A responsive claim that was never rendered at 320px is an untested claim.

## Checklist

```
## Layout — <surface>
## Sizing strategy (intrinsic | container query | breakpoint — and why)
## Breakpoints used (from the repo's scale?)
## Space reservation (late element — mechanism)
## Touch targets (element — size incl. padding — spacing)
## Hover-only affordances (element — touch/keyboard equivalent)
## Overflow decisions (region — truncate | wrap | scroll)
## Viewport units (any 100vh? — replaced with dvh?)
## Verified at (320 / 768 / 1024 / 1440 / 200% / longest content / RTL) — evidence
```
