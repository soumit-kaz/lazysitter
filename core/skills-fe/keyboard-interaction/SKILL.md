---
name: keyboard-interaction
description: Implement the WAI-ARIA Authoring Practices keyboard contract for the widget you are building — dialog, menu, listbox, combobox, tabs, disclosure, tree, grid. Load before building any custom interactive widget.
---

# Keyboard interaction patterns

## Name the pattern before writing the widget

Users already know these contracts. A "dropdown" that is really a listbox but behaves like a menu is worse than either, because it defeats knowledge the user already has. Decide which of the standard patterns you are implementing, then implement **that** contract.

## The contracts

### Button
`Enter` and `Space` activate. That is the whole contract — and it is why `<button>` beats `<div role="button">`, which must re-implement it (and usually forgets `Space`, or forgets that `Space` should activate on keyup and not scroll the page).

### Disclosure (show/hide)
`Enter`/`Space` toggles. `aria-expanded` on the trigger, `aria-controls` pointing at the region. No trap, no arrow keys. The simplest pattern and the right answer far more often than a menu.

### Modal dialog
`Escape` closes. Focus is trapped inside. `Tab`/`Shift+Tab` cycle within. `role="dialog"` + `aria-modal="true"` + an accessible name via `aria-labelledby`. Content behind is `inert` or `aria-hidden`. Focus returns to the trigger on close.

### Menu / menubar (a list of *actions*)
`Enter`/`Space`/`ArrowDown` opens from the trigger. `ArrowUp`/`ArrowDown` move between items (wrapping). `Home`/`End` jump to first/last. Type-ahead jumps to a matching item. `Escape` closes and returns focus. `Tab` closes and moves on.
**Roving tabindex**: exactly one item is `tabIndex={0}`, the rest `-1`.
Use this for actions. Do **not** use `role="menu"` for a navigation list — that is a `<nav>` with links.

### Listbox (choose *values*)
`ArrowUp`/`ArrowDown` move the selection. `Home`/`End`. Type-ahead. For multi-select: `Space` toggles, `Shift+Arrow` extends, `Ctrl/Cmd+A` selects all.
`role="listbox"` + `role="option"` with `aria-selected`. Either roving tabindex or `aria-activedescendant`.

### Combobox (text input + popup)
`ArrowDown` opens and moves into the list. `Escape` closes the popup, and a second `Escape` clears the input. `Enter` selects. Focus stays in the input; use `aria-activedescendant` to indicate the virtually-focused option.
`aria-expanded`, `aria-controls`, `aria-autocomplete` on the input. Announce the result count via a live region — otherwise a screen-reader user does not know anything appeared.

### Tabs
`ArrowLeft`/`ArrowRight` (or Up/Down for vertical) move between tabs. `Home`/`End` jump. Decide **automatic** activation (selection follows focus — good for cheap panels) or **manual** (`Enter`/`Space` activates — required when switching is expensive or destructive). Roving tabindex across the tab list; the panel is `tabIndex={0}` if it has no focusable content.

### Tree
`ArrowUp`/`ArrowDown` move through *visible* nodes. `ArrowRight` expands then moves in; `ArrowLeft` collapses then moves out. `Home`/`End`. Type-ahead. `aria-expanded` on parents, `aria-level`/`aria-setsize`/`aria-posinset` where the DOM does not convey structure.

### Grid / data table with interactive cells
Arrow keys move between cells. `Home`/`End` for row start/end, `Ctrl+Home`/`Ctrl+End` for the grid. **The grid takes a single tab stop** — `Tab` moves *out* of the grid, not between cells. A table with a tab stop per cell is unusable at any real size.

## Roving tabindex vs `aria-activedescendant`

- **Roving tabindex** — real DOM focus moves; exactly one item is `tabIndex={0}`. Simpler, and focus styles work naturally. Use it for menus, tabs, toolbars.
- **`aria-activedescendant`** — DOM focus stays on the container while an id points at the "active" child. Necessary when focus must remain in a text input (combobox). You must style the active option yourself, since it does not have real focus.

## Rules that apply to every pattern

- **Do not swallow `Tab`** except inside a modal trap. Users navigate with it.
- **Do not hijack browser or assistive-technology shortcuts** (`Ctrl+F`, `Ctrl+W`, single letters when focus is in a text field).
- **Wrap or clamp arrow navigation consistently** — pick one and apply it everywhere in the app.
- **Type-ahead** where the pattern specifies it: accumulate characters within ~500ms, match from the start, reset after the pause.
- **Every keyboard interaction that changes something invisible must be announced.**

## Testing

```jsx
await user.tab();
await user.keyboard('{ArrowDown}');
expect(screen.getByRole('option', { name: 'Second' })).toHaveFocus();
await user.keyboard('{Escape}');
expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
```
Use `userEvent`, not `fireEvent` — it produces the real pointer/focus/key sequence, and the part `fireEvent` skips is often exactly where the bug is.

## Checklist

```
## Keyboard — <widget>
## Pattern claimed (dialog | menu | listbox | combobox | tabs | disclosure | tree | grid)
## Key map implemented (key → behaviour) vs the pattern's required map — gaps listed
## Focus model (roving tabindex | aria-activedescendant) — and why
## Required ARIA (role, states, relationships) — present?
## Announcements for invisible changes
## Tests asserting each key (which keys are covered, which are not)
```
