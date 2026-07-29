---
name: ui-state-matrix
description: Enumerate and specify every state a UI surface can be in — loading, empty, error, partial, offline, permission, long content, concurrent. Load when writing a spec, and when verifying that each state was actually rendered.
---

# The UI state matrix

Almost every UI request describes only the happy path. **Frontend defects concentrate in the states nobody specified**, because unspecified states get whatever the implementation happened to produce — usually a blank area, a spinner that never stops, or a stack trace.

The matrix makes those states explicit at spec time, when they cost minutes, instead of at review time, when they cost a round.

## The states

| state | the question it answers | the usual failure |
|---|---|---|
| **initial / loading** | first load, before anything arrives | a spinner that flashes for 80ms, or a blank page |
| **empty — never searched** | onboarding: nothing exists yet | shown as "no results", which reads as an error |
| **empty — no results** | the filter matched nothing | no way to see or clear the active filter |
| **partial** | some data arrived, some failed | the failed part renders as empty, silently |
| **error — fetch failed** | network or server error | "Something went wrong", no retry |
| **error — render threw** | a component crashed | white screen (no error boundary) |
| **error — permission** | the user may not see this | a generic error, or an empty list implying nothing exists |
| **slow** | 300ms–3s, and beyond 10s | layout shifts when data lands; no way to leave and return |
| **offline** | no connectivity | infinite spinner |
| **stale** | cached data shown while refetching | no indication the data is old |
| **long content** | the longest realistic value | overlap, clipping, truncation with no way to see the full value |
| **concurrent** | another tab or user changed it | silent overwrite of someone else's edit |
| **success / post-action** | after the action completes | no confirmation; the user repeats it |

## Building the matrix

For each **surface** the feature adds (a page, a panel, a list, a form), mark each state:
- **specified** — with a criterion saying what the user sees and can do;
- **N/A** — with the **reason**. Silence is not N/A. "This list cannot be empty" is a claim, and usually a wrong one.

```
| surface        | loading | empty-new | empty-filtered | error | permission | offline | long |
|----------------|---------|-----------|----------------|-------|------------|---------|------|
| Export panel   | AC-3    | AC-4      | AC-5           | AC-6  | AC-7       | AC-8    | AC-9 |
| History table  | AC-10   | AC-11     | AC-12          | AC-13 | N/A (page  | AC-14   | AC-15|
|                |         |           |                |       | gated)     |         |      |
```

## Specifying each state well

- **Empty states have a job.** The never-searched empty state teaches what to do next; the no-results one shows the active filter and how to clear it. A single empty state serving both does neither.
- **Errors say what happened, whether it was the user's doing, and what to do next** — and preserve any input.
- **Loading states should not flash.** A short delay before showing a spinner, and a minimum display duration once shown. Skeletons that match the final layout's dimensions double as space reservation.
- **Stale data should say it is stale** if the user could act on it wrongly.
- **Permission-denied is a design decision**: hide, disable with a reason, or show an explicit message. Hiding is fine, but *silently rendering an empty list* is the worst option — it tells the user the data does not exist.

## Long content is where layout breaks

Use the **longest realistic value from the repo's real data**, not `"Test User"`. Names, titles, URLs, error messages, tag lists. Then check: truncation with the full value available (`title`, tooltip, or expandable), wrapping that does not break the layout, and no overlap. Add a CJK and an RTL string — they break different things.

## Verification: rendered, not asserted

**A state is covered when it has been rendered and observed** — a test, a story, or a screenshot. A state described in prose and never rendered is an OPEN observable concern, and the pipeline blocks on it.

That rule is the entire point of the matrix. Its purpose is not to produce a nice table; it is to make "we'll check the error state later" impossible to leave implicit.

## Checklist

```
## State matrix — <feature>
## Matrix table (surface × state → criterion id | N/A + reason)
## Empty-state distinction (never-searched vs no-results — both specified?)
## Error taxonomy (which errors are distinguished, and their messages)
## Loading behaviour (delay, minimum duration, skeleton dimensions)
## Stale-data indication
## Permission behaviour (hide | disable+reason | message)
## Long-content fixtures (the actual longest values used)
## Coverage (state → rendered where: test | story | screenshot) — UNRENDERED states listed
```
