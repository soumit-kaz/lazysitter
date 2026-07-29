---
name: hook-rules-audit
description: Audit React hook correctness — hook order, dependency arrays, stale closures, effects that should not exist, and cleanup. These are correctness bugs, not lint preferences. Load when writing or reviewing any component or custom hook.
---

# Hook rules audit

Hook violations are not style. They produce wrong behaviour that is intermittent, environment-dependent, and extremely hard to reproduce — the worst combination to debug.

## Start mechanical

```bash
lazysitter fe-index signals --rule REACT-CONDITIONAL-HOOK,REACT-HOOK-AFTER-RETURN,REACT-MISSING-DEP,REACT-DEPS-SUPPRESSED,REACT-EFFECT-NO-DEPS,REACT-SET-STATE-IN-RENDER,LEAK-NO-TEARDOWN
```
Findings marked `[heuristic]` need confirmation by reading the file. Say which are confirmed and which are candidates.

## 1. Hook order must be identical on every render

React identifies hooks by call order, not by name. Anything that changes the order between renders corrupts the mapping between hooks and their state.

Forbidden: a hook inside `if`, inside a loop, inside a callback, inside `try`, or **after an early return**.

The early return is the one that slips through review, because it reads as defensive:
```jsx
function Panel({ data }) {
  if (!data) return null;          // ← every hook below is skipped on this path
  const [open, setOpen] = useState(false);
```
The fix is to move the guard **below** the hooks, not to disable the rule. Hooks first, then guards, then render.

## 2. Dependency arrays are correctness

Every value a `useEffect`/`useMemo`/`useCallback` closure reads from the component scope must appear in its array. An incomplete array is a **stale closure**: the callback keeps a reference to the values from the render in which it was created, forever.

```jsx
useEffect(() => {
  const t = setInterval(() => save(draft), 1000);   // `draft` frozen at first render
  return () => clearInterval(t);
}, []);                                              // ← saves the first draft, always
```

This is not a lint nag. An `// eslint-disable-next-line react-hooks/exhaustive-deps` is a claim that the author knows better than the analysis. It needs a comment saying **why** — and the honest answer is usually that the real fix is a ref, a functional state update, or a differently-shaped effect.

Common legitimate patterns that remove the need to suppress:
- **functional updates** — `setCount(c => c + 1)` needs no `count` dependency;
- **refs for values you want to read but not react to** — a ref updated in an effect, read in a callback;
- **moving the function inside the effect** — if only the effect uses it, it does not need to be a dependency at all;
- **hoisting a constant out of the component** — a value that never changes does not belong in a dependency array.

## 3. Identity churn

A new object, array, or function literal is a **new identity every render**. That breaks `React.memo`, invalidates dependency arrays, and can loop an effect:

```jsx
useEffect(() => { load(options); }, [options]);   // options = {} created in render → infinite loop
```

Stabilize **where something compares identity** — a memoized child, a dependency array, a context value. Not reflexively: wrapping everything in `useCallback` costs allocations and readability and buys nothing where nothing compares.

## 4. Effects that should not exist

Ask of every effect: **is this synchronizing with something outside React?** A subscription, a DOM measurement, a timer, an imperative browser API — yes. Otherwise, probably not:

- **Deriving state from props** → compute it during render. An effect that only calls `setState` from props doubles the renders and creates a frame where the two values disagree.
- **Reacting to a user event** → put the logic in the event handler. An effect that watches state changed by a click is an indirection that fires on other paths too.
- **Fetching on mount** → in modern React that belongs in a data-fetching library or a server component; a raw `useEffect` fetch has to hand-roll cancellation, race handling, caching and error state, and usually gets one of them wrong.

## 5. State set during render

A state setter called directly in the render body is an infinite re-render loop. (The one legal form is the conditional "adjust state during render" pattern, which sets state *during* render guarded by a comparison and re-renders before committing — rare, deliberate, and it should be commented as such.)

## 6. Cleanup is not optional

Every subscription, timer, listener, observer, and abort controller needs teardown in the effect's return. Missing teardown accumulates on every mount — a route users visit repeatedly multiplies it.

Also check the teardown is **correct**: removing the *same* listener reference you added (a fresh arrow function every render removes nothing), clearing the *current* timer id, disconnecting the observer you created.

## 7. Concurrent-render safety

Render must be pure and repeatable. Under Strict Mode and concurrent features, a component may render twice and effects may mount, unmount and remount. Code that assumes a single execution fails intermittently:
- no mutation of anything outside the render's own scope;
- no side effects during render;
- no reading or writing a ref during render;
- effects must be resilient to running twice — the double-invoke in development exists to surface exactly the missing cleanup that would leak in production.

## Custom hooks inherit every rule

A custom hook that calls a hook conditionally makes **every caller** unsafe. A custom hook returning a fresh object each render breaks every caller's memoization. Audit exported hooks harder than components — their defects are inherited.

## Reporting

```
## Hook audit — <file or diff>
| finding | path:line | rule | confirmed | why it is a bug here |
## Suppressions found (path:line — reason given — does it survive reading?)
## Effects that should not be effects (path:line — what it should be instead)
## Missing/incorrect cleanup (path:line — what accumulates)
## Identity stability required (value — the consumer that compares it)
```
