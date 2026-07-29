---
name: render-performance
description: Diagnose and fix React re-render cost — identity churn, context fan-out, memoization that does and does not pay, and list reconciliation. Measure before optimizing. Load when a UI is slow, or when reviewing a change to a hot component.
---

# Render performance

## Measure first, and say what you measured

The single most common mistake here is optimizing a render that was never the problem. Before changing anything:
- **React DevTools Profiler** — record the interaction, read which components rendered, how often, and why. "Why did this render?" is the whole question, and the profiler answers it directly.
- **The index**, for the mechanical causes: `fe-index signals --rule PERF-INLINE-LITERAL-PROP,PERF-INLINE-FN-PROP,PERF-INDEX-KEY`
- **`fe-index impact`** on the component you are considering memoizing — how many places render it, and how often.

A performance claim without a measurement or a named mechanism is not a finding.

## The cost model

A React re-render is: run the component function, diff the returned element tree, commit the DOM changes that differ. **The render itself is usually cheap; the fan-out is what costs.** One parent re-rendering a hundred children is a hundred function calls and a hundred diffs.

So the questions are: what triggers the render, how far does it spread, and how expensive is each node.

## Cause 1 — identity churn (the most common by far)

A new object/array/function literal in props is a new identity every render:

```jsx
<List items={data} config={{ dense: true }} onSelect={() => pick(id)} />
```
Both `config` and `onSelect` are fresh every render. If `List` is memoized, the memo does nothing. If they land in a dependency array, the effect re-runs.

Fixes, in order of preference: hoist a truly-constant object to module scope · `useMemo`/`useCallback` where the value depends on props/state · restructure so the value is not needed as a prop at all.

**Only where something compares identity.** Memoizing a value passed to an unmemoized child that re-renders anyway is pure overhead.

## Cause 2 — context fan-out

A context provider whose `value` is a fresh object re-renders **every consumer on every provider render**:
```jsx
<Ctx.Provider value={{ user, setUser }}>   // new object each render
```
Fixes: memoize the value; or **split the context** into a rarely-changing state context and a stable actions context, so components that only dispatch never re-render on state changes. The split is the standard answer for a context with many consumers and frequent updates.

## Cause 3 — state living too high

State in a parent re-renders the whole subtree. If only one leaf uses it, move it down. This is free and it is usually the right fix — cheaper and clearer than memoizing the siblings.

The inverse trick, when state must live high: **push the changing part into a child** so the expensive siblings sit above it as `children` and do not re-render:
```jsx
<Layout>{/* expensive, stable */}<Counter />{/* the part that changes */}</Layout>
```

## Cause 4 — list reconciliation

`key={index}` is wrong the moment a list can reorder, filter, or take an insert. React matches by key, so an index key makes it reuse the wrong DOM node **and the wrong component state** — the classic symptom is a checkbox or input value attaching to the wrong row after a sort.

Use a stable domain id. If there genuinely is not one, that is a data problem worth naming rather than papering over.

## When memoization pays, and when it does not

`React.memo` pays when: the component is genuinely expensive or renders a large subtree, its props are stable, and its parent re-renders often for unrelated reasons.

It does not pay when: the component is cheap, its props change every render anyway (then it is a wasted comparison **plus** the render), or the parent rarely re-renders.

`useMemo` pays for genuinely expensive computation, or to stabilize identity for a consumer that compares it. It does **not** pay for `a + b`, where the memo bookkeeping costs more than the work.

Say what the memo is protecting. A memo with no named consumer is cargo cult.

## Interaction responsiveness (INP)

Slow interactions are usually a long task on the main thread, not a slow render:
- heavy synchronous work in an event handler → move it out, chunk it, or defer it;
- a large re-render per keystroke → debounce the *state update*, not the input value, so typing stays instant;
- `useTransition`/`useDeferredValue` to keep the urgent update (the typed character) ahead of the expensive one (the filtered list);
- unthrottled `scroll`/`resize`/`mousemove` listeners → throttle, and use `{ passive: true }` where you do not call `preventDefault`.

## Big lists

Above roughly a few hundred rendered rows, virtualize — see the `virtualization` skill. Below that, virtualization usually costs more complexity than it buys.

## Reporting

```
## Render performance — <surface>
## Measurement (profiler recording | index signals — what it showed)
## Cause (identity churn | context fan-out | state too high | list reconciliation | long task)
## Evidence (path:line, render counts)
## Fix (specific — and the consumer it protects)
## Expected effect (renders avoided, or the measurement to re-check)
## Explicitly NOT optimized (and why — cost exceeded measured benefit)
```
