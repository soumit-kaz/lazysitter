---
name: a11y-audit
description: Audit a UI for accessibility against WCAG 2.2 AA — run the engine, then do the two-thirds it cannot see. Load when designing, building, or verifying any user-facing surface.
---

# Accessibility audit

## Run the engine first

If an accessibility engine exists (jest-axe, `@axe-core/react`, `@axe-core/playwright`, or a wired `eslint-plugin-jsx-a11y`), **run it and report its output**. Automated testing catches roughly a third of real defects — a genuinely useful third, mechanically, with zero judgement.

If none exists, say **`degraded: true`** and name the gap. Do not substitute a reasoned reading of the JSX for a missing engine: accessibility properties are observable, and closing an observable concern by argument is exactly the failure the observable-claim rule exists to prevent.

```bash
lazysitter fe-index signals --rule A11Y     # mechanical findings with path:line
```

## Then the two-thirds the engine cannot see

An engine cannot press keys, follow focus, or judge whether an accessible name is *meaningful*. These checks need you.

### 1. Keyboard path — the highest-value check
With the pointer untouched:
- **Reach** every interactive element with `Tab`, in an order matching the visual order.
- **Activate** with `Enter` (and `Space` for buttons and checkboxes).
- Find anything **unreachable**: a control behind a hover-only affordance, a custom widget with no `tabIndex`, an element after a focus trap.
- Find any **trap**: somewhere `Tab` cannot escape and `Escape` does not release.
- Check **skip-to-content** exists if the nav is long.

### 2. Focus lifecycle
- **On open** (dialog, drawer, menu, popover): where does focus go? Usually the first focusable element or the container itself — not left behind on the trigger.
- **Trapped?** A modal dialog traps; a non-modal popover does not. Follow the pattern, not a habit.
- **`Escape`** closes and returns focus **to the trigger**.
- **On close or removal**: where does focus go when the element holding it disappears? Falling to `<body>` silently strands a screen-reader user mid-task, and nothing notices unless someone tests it.
- **On route change**: what receives focus, and what is announced? A SPA navigation is silent to a screen reader unless you make it speak.

### 3. Accessible names, and whether they are useful
Every control, icon-button, image and meaningful SVG has a name. Then the harder question: **is it useful out of context?** "Read more" ×12 on a page is technically named and practically useless — a screen-reader user listing links hears the same thing twelve times.

A placeholder is not a name; it disappears when the user types.

### 4. Announcement of change
A change outside the point of focus needs a live region or an announcing role: result counts, validation errors, toasts, save confirmations, loading completions.
- `aria-live="polite"` (or `role="status"`) for most things — waits for a pause.
- `aria-live="assertive"` (or `role="alert"`) **only** for genuine interruptions. Over-using it makes the interface shout.
- The live region must exist in the DOM **before** the content changes; injecting a region and its content together often announces nothing.

### 5. Semantics and structure
- Native element first, ARIA second. **The first rule of ARIA is: do not use ARIA if a native element does the job.** A `<div role="button" tabIndex={0}>` re-implements — usually incompletely — what `<button>` gives free.
- Heading order without skips, describing the actual outline.
- Landmarks (`main`, `nav`, `header`, `footer`) present and singular where required.
- Lists as lists, tables as tables with proper headers and scope.

### 6. Colour and contrast (WCAG 2.2 AA)
- Body text **4.5:1**, large text (18.66px bold / 24px) **3:1**.
- **UI components and their focus indicators 3:1** against adjacent colours — the one people forget, and it is why so many focus rings are invisible.
- **Colour is never the sole carrier of meaning** — errors, statuses and required fields need text or an icon too.

### 7. Zoom, reflow and target size
- **200% zoom** and **320px width**: content reflows without horizontal scrolling or clipping.
- **Target size 24×24 CSS px minimum** (WCAG 2.2 AA); 44×44 is the comfortable standard, including padding.
- Text remains readable with user-set spacing overrides.

### 8. Motion and timing
- Everything animated respects `prefers-reduced-motion`.
- Nothing auto-plays, auto-advances, or auto-scrolls without a control.
- Any time limit is adjustable or removable.

## Severity, honestly

**Blocking** — the task becomes impossible without a pointer or without sight: an unreachable control, lost focus, an unnamed control on the critical path, a keyboard trap, a form error announced only by colour.

**Recorded, not blocking** — a heading-order skip, a redundant ARIA attribute, a low-contrast decorative element, a non-ideal but usable name.

Say which each is and why. An audit that marks everything blocking gets ignored; one that marks nothing blocking is decoration.

## Reporting

```
## Accessibility audit — <surface>
## Engine (command — exit code — violations by impact) | absent → degraded
## Keyboard path (element — reachable — order — activates — trap?)
## Focus lifecycle (open → · trapped? · Escape → · close → · removal → · route change →)
## Names (control — name — useful out of context?)
## Announcements (change — mechanism — politeness)
## Semantics (native vs ARIA · headings · landmarks · lists/tables)
## Contrast (text · UI components · focus indicators — measured ratios)
## Zoom/reflow (200%, 320px) · target sizes
## Motion & timing
## Blocking vs recorded (with the reason for each classification)
```
