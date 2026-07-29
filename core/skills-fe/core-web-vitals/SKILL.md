---
name: core-web-vitals
description: Diagnose and protect LCP, INP and CLS — what each measures, what actually causes regressions, and how to verify. Load when a change affects a route's loading, interactivity, or layout.
---

# Core Web Vitals

Three metrics, three distinct causes. Treating them as one "performance" number is why teams optimize the wrong thing.

## LCP — Largest Contentful Paint

**What it measures:** when the largest text block or image in the viewport finishes rendering. Proxy for "the page looks loaded."

**Find the element first.** It is usually a hero image, a headline, or the first row of a data table — and it is frequently not what people assume. The DevTools Performance panel names it. Optimizing anything else is wasted work.

**Causes, in order of frequency:**
- **The resource is discovered late.** An image loaded by JavaScript, or referenced deep in a CSS file, cannot start downloading until that JS/CSS is parsed. Fix with a real `<img>` in the HTML, `fetchpriority="high"`, or `<link rel="preload">`.
- **Render-blocking resources.** Synchronous scripts and stylesheets in `<head>` delay everything.
- **Client-side fetching of above-the-fold content.** The browser must load JS, hydrate, fetch, and only then render. Server-render it instead — the largest single LCP win available in a Next app.
- **Font blocking text render.** `font-display: swap` or `optional`.
- **The image is bigger than it needs to be.** Correct dimensions, modern format, responsive `srcset`.

**Do not lazy-load the LCP image.** `loading="lazy"` on the hero is a self-inflicted LCP regression, and it is a common one.

## INP — Interaction to Next Paint

**What it measures:** the latency from a user interaction to the next visual update, across the whole session. Replaced FID, and is much harder to satisfy — FID measured only the delay before the handler ran; INP measures until the user sees a result.

**Causes:**
- **A long task blocking the main thread** — heavy synchronous work in a handler. Break it up (`scheduler.yield()` where available, or chunk it), or move it to a worker.
- **A large re-render triggered per keystroke.** Debounce the *state update*, not the input value, so typing stays instant while the expensive list updates less often. `useDeferredValue`/`useTransition` express exactly this: the typed character is urgent, the filtered list is not.
- **Unthrottled `scroll`/`resize`/`mousemove` handlers.** Throttle, and pass `{ passive: true }` where you never call `preventDefault` — a non-passive touch/wheel listener blocks scrolling itself.
- **Layout thrashing** — reading a layout property (`offsetHeight`, `getBoundingClientRect`) after writing a style, in a loop. Each read forces a synchronous reflow. Batch reads, then writes.
- **Hydration blocking early interaction.** A button rendered but not yet hydrated does nothing when clicked. Narrower client boundaries and less client JS both help.

## CLS — Cumulative Layout Shift

**What it measures:** how much visible content moves unexpectedly. The most *directly* fixable of the three, because every cause is a missing dimension.

**Causes:**
- **Images/video without dimensions.** Set `width`/`height` or `aspect-ratio` — the browser then reserves the box before the file arrives.
- **Async content with no reserved space**, or a skeleton smaller than the final content.
- **Fonts.** A fallback with different metrics reflows on swap. `size-adjust`/`ascent-override`, or a fallback chosen to match.
- **Content injected above existing content** — banners, cookie notices, error messages appearing at the top. Reserve the space, or render them where they do not push.
- **Ads and embeds** — always reserve their slot.

Shifts within 500ms of a user interaction are excluded, which is why opening an accordion does not count against you. That exclusion does **not** cover a shift caused by a late-arriving fetch.

## Lab vs field

- **Lab** (Lighthouse, a local trace) is reproducible and tells you *why*. It runs on one machine with one network profile.
- **Field** (RUM, CrUX) is what users actually experience and is what the metric is scored on.

They disagree routinely, and that is not a contradiction — field data covers slow devices, bad networks, and cold caches your laptop does not. **Fix what the lab tells you; verify with the field.**

Report the conditions with any number. A metric without its conditions is not comparable to anything.

## Verifying a change

1. Measure the affected route **before** the change.
2. Make the change.
3. Measure again, same conditions.
4. Report both numbers and the conditions.

Throttle CPU (4–6×) and network in the lab. An unthrottled measurement on a developer machine tells you almost nothing about a mid-range phone, which is where the metric is decided.

## Checklist

```
## Web Vitals — <route>
## LCP element (what it is — before → after — conditions)
## LCP causes addressed (discovery / render-blocking / client-fetch / font / size)
## INP (before → after — the interaction measured)
## INP causes addressed (long task / re-render / listener / thrashing / hydration)
## CLS (before → after) + every late-arriving element and how its space is reserved
## Measurement conditions (device/CPU throttle/network/cache state)
## Field verification (available? — what it shows)
```
