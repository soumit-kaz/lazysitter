---
name: focus-management
description: Get focus right for dialogs, drawers, menus, toasts, route changes and removed elements. Focus is application state with an owner. Load when building anything that opens, closes, or navigates.
---

# Focus management

Focus is **state**, and like any state it needs an owner and a defined transition for every event. Unowned focus is where keyboard and screen-reader users get stranded, and it is invisible to anyone testing with a mouse.

## The four transitions, for everything that opens

1. **On open — where does focus go?**
   - Modal dialog: the container itself (with `tabIndex={-1}`) or the first meaningful control. Not the close button — a screen-reader user then hears "Close" as the dialog's first content.
   - Destructive confirmation: the **safe** action, not the destructive one.
   - Non-modal popover/menu: the first item.
   - Never leave focus on the trigger while a modal is open — the user tabs into content behind the overlay.

2. **While open — is it trapped?**
   - **Modal dialog: trap.** `Tab` from the last focusable wraps to the first. Everything outside is `inert` or `aria-hidden`.
   - **Non-modal popover, tooltip, disclosure: do not trap.** Tabbing out should close it.
   Follow the pattern, not a habit — trapping a non-modal is as wrong as not trapping a modal.

3. **On close — where does focus return?**
   To the element that opened it. Store the trigger before opening; restore after closing. If the trigger no longer exists (a row deleted by the dialog's action), fall back to a stable nearby landmark and say which — never to `<body>`.

4. **`Escape`** closes and returns focus. Universal expectation; its absence is a blocking defect for a modal.

## The removal case — the one everyone misses

**When the element holding focus is removed, focus falls to `<body>`.** The user's position in the document is gone: `Tab` restarts from the top, and a screen reader announces nothing. It is completely silent to a sighted mouse user, so it survives review indefinitely.

This happens on: deleting a row whose button had focus · a dismissed toast that had been focused · a filter that removes the focused item · a completed async action that unmounts its own trigger.

Fix: before removing, move focus somewhere sensible — the next item, the previous item, or the container — and say so in the code. Test it by deleting the last item in a list with the keyboard.

## Route changes in an SPA

A client-side navigation does not reset focus and announces nothing. Both need doing explicitly:
- move focus to the new page's `<h1>` or main landmark (with `tabIndex={-1}`), or to a skip target;
- announce the new page title via a live region.

Without this a screen-reader user activates a link and nothing appears to happen.

## Focus must be visible

- Never remove an outline without replacing it. `:focus-visible` gives you the keyboard-only ring, so there is no reason left to remove focus styles for mouse aesthetics.
- The indicator needs **3:1 contrast against both** the component and the adjacent background — a ring that vanishes on one of the two backgrounds it borders is not visible.
- Ensure it is not clipped by `overflow: hidden` on an ancestor, which silently hides rings on items inside scroll containers.

## Ordering

- **DOM order is focus order.** Do not reorder visually with CSS (`order`, `row-reverse`, absolute positioning) in a way that diverges from DOM order — keyboard users then jump around the screen.
- **No positive `tabIndex`.** It overrides natural order globally and is essentially never right. `tabIndex={0}` adds to natural order; `tabIndex={-1}` makes something programmatically focusable but not tabbable — that is the right tool for containers you focus by script.

## Toasts and transient content

A toast should not steal focus — that interrupts whatever the user is doing. Announce it via a live region instead. If it contains an action ("Undo"), it must be reachable: either keep it available long enough and make it tabbable, or provide the same action elsewhere. An action that disappears before a keyboard user can reach it does not exist for them.

## Testing it

```jsx
await user.tab();
expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
await user.keyboard('{Escape}');
expect(trigger).toHaveFocus();          // returned to the opener
```
Keyboard tests are cheap, fast, and catch exactly what the axe engine cannot see. Every dialog, drawer and menu deserves one.

## Checklist

```
## Focus — <component>
## Open → where (and why that element)
## Trapped? (modal: yes / non-modal: no) — how outside content is inert
## Escape → where
## Close → where (and the fallback if the trigger is gone)
## Removal → where (the deleted-focused-element case)
## Route change → what receives focus, what is announced
## Visibility (indicator, 3:1 against both surfaces, not clipped)
## Order (DOM order == visual order? any positive tabIndex?)
## Tests written (which transitions are asserted)
```
