---
name: virtualization
description: Decide whether a long list needs virtualization, and implement it without breaking accessibility, search, or scroll restoration. Load when rendering a list whose length is not bounded by design.
---

# Virtualization

## Decide with the real maximum, not today's data

The question is not "is this list long?" but **"what is the largest number of items this can hold?"** A list that is fine at 20 rows and unusable at 5,000 is a defect waiting for the customer with 5,000.

Get the number from the data-shape facts the exploration recorded. If nobody knows the maximum, **that is the finding** — an unbounded render path is a defect regardless of what today's data happens to contain.

## Thresholds, roughly

- **Under ~100 simple rows** — render them all. Virtualization costs complexity it does not repay.
- **100–500** — depends on row cost. A row with one text node is cheap; a row with a chart, an avatar, and five interactive controls is not.
- **Above ~500** — virtualize, or paginate.

**Consider the alternatives first.** Pagination, "load more", or a server-side query with a limit are often better answers than virtualization: they are simpler, they bound the data transfer too, and they do not break the behaviours below. Virtualization is the right answer when the user genuinely needs to scroll a long list continuously.

## What virtualization breaks, and what to do about it

This is the part that gets skipped, and it is why virtualized lists so often ship with real defects.

**Ctrl+F stops working.** Only rendered rows are in the DOM, so the browser's find cannot see the rest. If in-page search matters, provide your own search — and say so, because users will try the browser's first.

**Accessibility needs explicit help.** A screen reader cannot count items that are not there:
- put `aria-setsize` (the total) and `aria-posinset` (the index) on each rendered row;
- keep the list semantics (`role="list"`/`listbox"` + items) intact through the windowing wrapper;
- ensure keyboard navigation can reach items outside the window — arrow keys must scroll the window, not stop at its edge.

**Focus is lost when a focused row scrolls out and unmounts.** Handle it: keep the focused item rendered even outside the window, or move focus deliberately.

**Scroll restoration breaks.** Returning to a virtualized list restores a scroll offset whose content is not rendered yet, so the browser lands somewhere wrong. Restore by item index, not by pixel offset.

**Anchor links and deep links to an item** need scroll-to-index support.

**Variable row heights** need measurement, and measurement causes shift as estimates are corrected. Prefer fixed or predictable heights where the design allows; where it does not, use a library that measures and caches, and accept some shift during fast scrolling.

## Implementation notes

- Use an established library (`@tanstack/react-virtual`, `react-window`, `react-virtuoso`) rather than hand-rolling. The edge cases — resize, variable heights, sticky headers, RTL — are numerous and boring.
- **Set the container height explicitly.** A virtualizer inside an auto-height container renders one row or all of them.
- **Keep row components memoized and their props stable** — a fresh callback per row defeats memoization and re-renders the whole window on every scroll frame, which is precisely what you were trying to avoid.
- **Overscan** a few rows beyond the viewport so fast scrolling does not show blank space.
- **Sticky headers, sticky first column, and grouping** all need explicit support — check the library handles what the design requires before committing.

## Measuring the result

Measure with the **real maximum** dataset:
- scroll frame rate during a fast flick;
- INP for interactions inside the list;
- memory over a long scroll session (a virtualizer that leaks per-row listeners is worse than no virtualizer).

Report the numbers. "It feels smooth" is not a measurement, and it is measured on the fastest machine in the building.

## Checklist

```
## Virtualization — <list>
## Real maximum item count (source of the number) — or UNBOUNDED (a finding)
## Decision (render all | paginate | load-more | virtualize) — and why
## Library + version (if virtualizing)
## Row height strategy (fixed | measured — shift consequence)
## Accessibility (aria-setsize/posinset · list semantics preserved · keyboard reaches beyond window)
## Focus handling when a focused row unmounts
## Scroll restoration (by index, not pixels)
## In-page search (browser Ctrl+F broken — replacement provided?)
## Deep-link / scroll-to-item support
## Measured at max size (frame rate · INP · memory over a long session)
```
