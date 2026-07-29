---
name: data-fetching-cache
description: Design and audit client data fetching — query keys, invalidation edges, optimistic updates, out-of-order responses, retry and error surfacing. Load when a feature reads or mutates server data.
---

# Data fetching and cache correctness

## Query keys are the contract

A key identifies a cached result. Get it wrong in two directions:
- **too coarse** — `['users']` for a filtered, paginated list means every filter change collides on one entry, and the wrong data flashes on screen;
- **too fine** — a key including a value that changes every render (an object literal, a `Date.now()`) means the cache never hits and every render refetches.

A key must include **every input that changes the result**: the resource, the id, the filters, the pagination, the sort, and the locale if the server localizes. Serialize it stably — an object literal in a key is a fresh identity each render unless the library normalizes it.

Record the repo's existing convention before inventing one; a feature with a different key shape is a feature nothing else can invalidate.

## Invalidation edges are the part that gets forgotten

**Every mutation must name which keys it invalidates.** The "list still shows the deleted row" bug is always a missing edge, and it is invisible in review of any single file because the mutation and the list live apart.

Write them as a table in the plan:
```
mutation            invalidates
createItem      →   ['items', listFilters]  ['items','count']
deleteItem      →   ['items', *]  ['item', id]  ['items','count']
updateItemName  →   ['item', id]  ['items', *]   (name is rendered in the list)
```
That last one is the case people miss: a mutation that "only" changes a detail field, where the field is also displayed in a list.

## Out-of-order responses are a correctness bug, not an edge case

Two requests in flight can resolve in the wrong order, and the **slower-but-earlier** one wins. In a search box this shows results for a query the user already deleted.

Three real fixes:
1. **Abort the previous request** (`AbortController`) — best when only the latest matters.
2. **Guard with a request id** — capture a sequence number, ignore a response that is not the latest.
3. **Key the cache by the input** so a stale response lands in a different cache entry and simply is not read.

A good data library does (3) for you, which is a strong reason to use one rather than hand-rolling `useEffect` fetches. If the feature hand-rolls, it must implement one of these explicitly — "it probably won't happen" is not a design.

## Optimistic updates

Optimistic updates are a real UX win and a real complexity cost. If you use them, decide all four:
- what the optimistic state looks like;
- how the **rollback** works on failure — and it must restore the *previous* value, not a re-fetch that might race;
- what the user is told when it fails after appearing to succeed — silently reverting is disorienting;
- what happens if a second mutation starts before the first resolves.

If you cannot answer all four, do not use optimistic updates. A brief spinner is better than a value that flickers back.

## Retry and error surfacing

- **Retry only idempotent reads by default.** Automatically retrying a POST can double-create.
- **Do not retry a 4xx.** A 401, 403 or 422 will not succeed on the second attempt; retrying delays the honest error and hides the cause.
- **Distinguish error kinds in the UI**: offline, timeout, server error, permission denied, and validation failure are five different messages and five different recovery paths. Collapsing them into "Something went wrong" satisfies the code path and abandons the user.
- **Preserve the user's input** across a failed submission. Losing typed work to an error is the defect people actually remember.

## Waterfalls

A fetch that cannot start until another resolves doubles the wait. The common cause is a component that only renders after its parent's data arrives, and then fetches its own. Fix by hoisting both fetches to where their inputs are known, or by fetching on the server where the router supports it.

Read the diff's data flow and say plainly whether anything was serialized that could have been parallel.

## Loading states that do not flash

A spinner shown for 80ms is worse than no spinner. Use a short delay before showing one, and once shown, keep it up for a minimum duration so it does not strobe. Prefer skeletons matching the final layout's dimensions — they double as space reservation and prevent layout shift.

## Auditing an existing implementation

```bash
lazysitter fe-index query --has-hook useQuery
lazysitter fe-index query --has-hook useEffect --kind component   # candidate hand-rolled fetches
lazysitter fe-index signals --rule REACT-MISSING-DEP,REACT-EFFECT-NO-DEPS
```
Then read each fetch site and check: key completeness, invalidation edges, out-of-order handling, retry policy, error differentiation, input preservation.

## Reporting

```
## Data fetching — <feature>
## Query keys (key — inputs included — complete?)
## Invalidation table (mutation → keys — path:line of each)
## Out-of-order handling per async surface (abort | request-id | cache-keyed | NONE)
## Optimistic updates (used? — rollback — failure message — concurrent mutation)
## Retry policy (what retries, what must not)
## Error differentiation (kind → message → recovery path)
## Input preservation on failure
## Waterfalls (serialized fetches that could be parallel)
## Loading-state behaviour (delay, minimum duration, skeleton dimensions)
```
