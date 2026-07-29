---
name: error-boundaries
description: Decide where errors are caught and what the user sees — boundary placement, what boundaries do and do not catch, recovery, and Suspense interaction. Load when adding a route, a data-fetching surface, or any component that can throw.
---

# Error boundaries and failure containment

## The default is a white screen

An unhandled render error unmounts the **entire React tree**. Not the broken component — everything. That is deliberate: React would rather show nothing than a corrupted UI. It also means a single unguarded component takes down the whole app.

Boundary placement is therefore a design decision about **how much of the UI a failure is allowed to take with it**.

## What a boundary catches, and what it does not

**Catches:** errors thrown during render, in lifecycle methods, and in constructors of the tree below it.

**Does not catch — and this surprises people:**
- errors inside **event handlers** (use try/catch there; the app is not in an inconsistent state, so React does not unmount);
- **async errors** — a rejected promise, a `setTimeout` callback, a fetch `.catch` you did not write;
- errors in the boundary's **own** render;
- **server-side rendering** errors (the framework handles those separately).

So a boundary does not make an app error-proof. It contains one specific class — the render throw — and the other classes need their own handling.

## Placement: three levels

1. **Root** — the last resort. A full-page error with a reload option and a report. Something must be here, or an unhandled error is a blank tab.
2. **Route/segment** — the common case. A failure in one route shows an error in the content area while the nav, header and shell survive, so the user can navigate away. In the Next App Router this is `error.tsx` per segment; **a segment with none inherits the parent's, and a route tree with none at all gives you the white screen.**
3. **Widget** — around anything independently failable and non-essential: a chart, an embedded third-party widget, a recommendations panel, a comments section. The rest of the page stays usable.

Do **not** wrap every component. A boundary around something essential produces a page that renders with a hole in it and no way forward — worse than an honest error.

## What the fallback should do

- **Say what failed**, at the granularity of the boundary. "We couldn't load your recent activity" beats "Something went wrong" and beats a stack trace.
- **Offer a real recovery.** A retry that re-mounts the subtree (via a `key` change or a reset callback) is far better than "reload the page", which loses all other state.
- **Preserve the user's context.** Do not navigate them away from work they had in progress.
- **Report the error** — with component stack, route, and a correlation id. An error boundary that swallows silently is worse than no boundary, because the failure is now invisible to you *and* to the user.
- **Never render raw error text or a stack** to users. It is noise to them and information disclosure to an attacker.

## Interaction with Suspense

`<Suspense>` handles the *pending* state; an error boundary handles the *failed* state. Data-fetching surfaces need **both**, and they usually belong at the same level:

```jsx
<ErrorBoundary fallback={<ActivityError onRetry={reset} />}>
  <Suspense fallback={<ActivitySkeleton />}>
    <RecentActivity />
  </Suspense>
</ErrorBoundary>
```
Placing them at different levels produces the confusing case where a failure escapes past a skeleton to a much larger fallback.

## Async errors need their own path

A data library surfaces fetch failures as **state**, not as throws — so a boundary never sees them unless you opt in. Decide per surface:
- render the error state inline (usually better: it keeps the surrounding UI and can offer a targeted retry), or
- throw it during render so the boundary catches it (better when the surface is meaningless without the data).

Both are valid. Choosing neither — and rendering an empty component on failure — is the silent-failure case that survives review because nothing looks broken.

## Global handlers as a backstop

`window.onerror` and `unhandledrejection` catch what boundaries structurally cannot. Wire them to your error reporter. They are for **observability**, not recovery — you cannot repair a React tree from there.

## Testing it

Render a component that throws and assert the fallback appears and the rest of the page survives. It is a three-line test and it is the only way to know the boundary is actually mounted where you think it is — a boundary in the wrong place looks identical to a correct one until something throws.

## Checklist

```
## Error containment — <feature>
## Boundary placement (level — what it protects — what survives a failure below it)
## Route-segment coverage (segment — error boundary present? — GAPS)
## Fallback content (what it says · recovery offered · context preserved)
## Reporting (what is sent — component stack, route, correlation id)
## Suspense pairing (surface — boundary and suspense at the same level?)
## Async error path per fetch (inline state | thrown to boundary | NEITHER ← finding)
## Event-handler errors (try/catch where needed)
## Global handlers wired (onerror, unhandledrejection)
## Tests (a throwing component asserts the fallback and the surviving UI)
```
