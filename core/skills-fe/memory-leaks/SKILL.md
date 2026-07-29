---
name: memory-leaks
description: Find and fix frontend memory leaks — missing teardown, growing caches, detached DOM, and closures holding trees alive. Load when a component subscribes to anything, and when a long-lived SPA degrades over time.
---

# Memory leaks

A leak in a page that reloads every few minutes is invisible. In a single-page app a user keeps open all day — a dashboard, an editor, an admin console — it degrades until the tab is unusable, and the bug report says "it gets slow after a while", which nobody can reproduce in a five-minute session.

```bash
lazysitter fe-index signals --rule LEAK-NO-TEARDOWN
```

## The five sources

### 1. Missing effect teardown — by far the most common
Every one of these needs a cleanup return:
```jsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  window.addEventListener('resize', onResize);
  const obs = new ResizeObserver(cb); obs.observe(el);
  const sub = stream.subscribe(next);
  return () => {
    clearInterval(id);
    window.removeEventListener('resize', onResize);   // the SAME reference
    obs.disconnect();
    sub.unsubscribe();
  };
}, []);
```
Each accumulates on **every mount**. A route the user visits ten times has ten intervals firing.

Two teardown bugs that look correct:
- **`removeEventListener` with a different function reference** removes nothing. An inline arrow in both places creates two distinct functions.
- **Clearing a stale timer id** — capturing the id in a closure that has been re-created since.

### 2. Caches without bounds
A `Map` keyed by id at module scope, memoized results, an in-memory image cache. Every entry is retained forever, and the keys are usually unbounded (an id per row the user has ever viewed).

Bound it: an LRU with a maximum size, a TTL, or clear it on a lifecycle event. "It's only small objects" stops being true at ten thousand entries.

### 3. Detached DOM held by JavaScript
A reference to a DOM node kept in a module-level variable, a closure, or a cache after the node is removed keeps **the node and its entire subtree** alive. This is why a leak can be megabytes from what looks like one stray reference.

Symptom in DevTools: "Detached HTMLDivElement" counts climbing across mount/unmount cycles.

### 4. Closures capturing more than intended
An event handler registered globally that closes over a component's props keeps that whole render's scope alive — including anything it referenced. Because the handler was never removed (see 1), the chain persists.

### 5. Subscriptions in custom hooks
**A leaky hook is inherited by every consumer.** One missing teardown in a shared `useWebSocket` multiplies across the app. Audit exported hooks harder than components — that is where a single fix pays the most.

## Finding a leak

The reliable procedure, in Chrome DevTools → Memory:
1. Take a heap snapshot.
2. Perform the suspect cycle **several times** — navigate to the route and away, open and close the modal, mount and unmount the component. Repetition is what separates a leak from normal allocation.
3. Force garbage collection.
4. Take a second snapshot.
5. **Compare** the two, filtering to objects allocated between them. Look for counts that grew by the number of cycles — five cycles producing five retained instances is unambiguous.
6. Follow the **retainer path** to see what is holding each one. That path names the bug.

For listeners specifically, `getEventListeners(window)` in the console shows accumulation directly, and it is the fastest check available.

## Strict Mode is an ally

React's development double-invoke mounts, unmounts and remounts effects deliberately. An effect with missing or incorrect cleanup **misbehaves visibly** under it — doubled subscriptions, doubled requests. That noise is the feature: it surfaces in development exactly the leak that would be silent in production. Fix the cleanup rather than working around the double-invoke.

## Prevention

- **`AbortController`** for fetches, aborted in cleanup — this also fixes the out-of-order-response problem.
- **Prefer the `signal` option** on `addEventListener` where available: one abort tears down every listener registered with it.
- **Prefer declarative APIs** — the `async` pipe equivalent, a data library's subscription management — over manual subscribe/unsubscribe. The best teardown is the one you did not have to write.
- **`WeakMap`/`WeakRef`** for caches keyed by objects that should be collectible.

## Checklist

```
## Memory — <feature>
## Subscriptions/timers/listeners/observers added (path:line — teardown present? — same reference?)
## Caches introduced (path:line — bounded? — eviction policy)
## Module-level mutable state (path:line — what it retains)
## Exported hooks audited (hook — subscribes to — tears down?)
## Fetch cancellation (AbortController on unmount?)
## Measurement (snapshot procedure run? — cycles — retained-object delta — retainer path)
## Strict Mode behaviour (any doubled effects indicating missing cleanup)
```
