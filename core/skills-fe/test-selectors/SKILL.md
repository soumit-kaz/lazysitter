---
name: test-selectors
description: Write frontend tests that assert user-visible behaviour and survive refactors — query priority, why role queries double as accessibility assertions, async waiting, and what never to assert. Load when writing or reviewing component tests.
---

# Test selectors and assertions

## Query priority, and the reason for it

1. **`getByRole(role, { name })`** — how assistive technology finds the element.
2. **`getByLabelText`** — form controls.
3. **`getByPlaceholderText`** — only when there is genuinely no label (which is itself a defect).
4. **`getByText`** — non-interactive content.
5. **`getByDisplayValue`** — the current value of an input.
6. **`getByTestId`** — **last resort**.

This is not a style preference. **A role query that passes proves the element is exposed to assistive technology with an accessible name** — so it tests behaviour and accessibility in a single assertion. A `data-testid` proves only that someone added an attribute.

```jsx
getByRole('button', { name: 'Delete item' })   // asserts: it is a button, and it is named
getByTestId('delete-btn')                       // asserts: an attribute exists
```
The first fails if the button becomes a `<div>` with no role, or loses its label. The second passes happily while the UI becomes unusable by keyboard and screen reader.

## When `data-testid` is legitimate

- A container with no accessible representation (a layout wrapper you need to scope a query to).
- Elements distinguished only by position among identical siblings.
- A canvas or custom-rendered surface with no DOM semantics.

Each one deserves a comment saying why. Every testid is a place where the test can pass while the UI is broken for real users.

## Assert the outcome, not the mechanism

```jsx
expect(mockDelete).toHaveBeenCalledWith(id);                 // implementation detail
expect(screen.queryByText('Invoice #42')).not.toBeInTheDocument();   // the outcome
```
The first breaks on a refactor that changed nothing the user sees, and passes when the delete succeeds but the row stays on screen — which is the actual bug. Assert what the user would observe.

Mock assertions are fine as a *supplement* when the side effect is genuinely invisible (analytics fired, a request sent with the right body). They should not be the primary assertion for anything visible.

## Never assert on

- **class names** — they change with every styling refactor and mean nothing to a user;
- **DOM structure depth** — `container.firstChild.children[2]`;
- **internal component state** — test through the rendered output;
- **a whole-tree snapshot as a substitute for an assertion.** A snapshot nobody reads is a change-detector, not a test: it fails on every intentional change and is approved without reading, so it eventually asserts nothing. Small, targeted snapshots of stable output are fine.

## Async: wait for the condition, never for a duration

```jsx
await screen.findByText('Saved');                            // waits for the condition
await waitFor(() => expect(mockSave).toHaveBeenCalled());
await waitForElementToBeRemoved(() => screen.queryByRole('progressbar'));

await new Promise(r => setTimeout(r, 1000));                 // a flake generator
```
A fixed timeout is simultaneously too slow on fast machines and too fast on loaded CI. Every one of them is a future intermittent failure.

Use `queryBy*` (returns null) for absence assertions, `findBy*` (async) for appearance, `getBy*` (throws) for things that must already exist.

## `userEvent`, not `fireEvent`

`fireEvent.click` dispatches one event. `userEvent.click` produces the real sequence — pointer down, focus, pointer up, click — and respects things like `pointer-events: none` and disabled state.

**The skipped part is often exactly where the bug is.** A handler that depends on focus having moved works under `fireEvent` and fails for real users.

```jsx
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: 'Save' }));
await user.type(screen.getByLabelText('Email'), 'a@b.com');
await user.keyboard('{Escape}');
await user.tab();
```

## Accessibility assertions belong in the same suite

```jsx
expect(await axe(container)).toHaveNoViolations();          // the mechanical third
await user.tab();
expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();   // the rest
```
Keyboard-path and focus tests are cheap, fast, and catch exactly what the axe engine cannot. Every dialog, menu and form deserves a few.

## Test the states, not just the happy path

The spec's UI state matrix names loading, empty, error, partial, permission and long-content. Each deserves a test. **These are where UI defects concentrate**, and a suite that covers only the happy path gives false confidence in exactly the wrong direction.

## Fixtures

Use the spec's named worst-case values — the longest realistic string, an RTL string, emoji, an empty array, a null. `"Test User"` and three rows never find the truncation, the overlap, or the locale bug.

## Checklist

```
## Tests — <component>
## Query priority used (role/label/text vs testid — every testid justified)
## Outcome vs mechanism (assertions on what the user observes)
## Forbidden assertions (class names, DOM depth, internal state, blanket snapshots) — none present
## Async waiting (findBy/waitFor — no fixed timeouts)
## userEvent (not fireEvent)
## Accessibility assertions (axe + keyboard path + focus)
## State coverage (matrix state → test) — gaps listed
## Fixtures (worst-case values from the spec)
```
