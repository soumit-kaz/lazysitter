---
name: bundle-budget
description: Set and enforce a JavaScript bundle budget — measure the delta, attribute what grew, split at the right seams, and judge whether a dependency is worth its weight. Load when adding a dependency or reviewing bundle impact.
---

# Bundle budget

Every kilobyte of JavaScript is downloaded, parsed, compiled and executed on the user's device — and the parse/execute cost is the part that hurts on a mid-range phone, not the download.

## State a budget or you have said nothing

A budget is a number: *"this feature adds at most 15KB gzipped to the `/dashboard` entry."* "Keep an eye on bundle size" cannot fail, and a check that cannot fail is not a check.

Where a measurement harness exists, the perf-auditor compares the measured delta against that number and the verdict is mechanical.

## Measure the delta, do not estimate it

```bash
# whichever the repo has
npx @next/bundle-analyzer / ANALYZE=true npm run build
npx size-limit
npx vite-bundle-visualizer
```
Build **before** and **after**, and report the delta per chunk and per route entry. If no harness exists, say `cannot-verify-offline` — do not present an estimate as a measurement.

## Attribute the growth

"The bundle grew 40KB" is a fact. *"The bundle grew 40KB because `date-fns` is imported at the root of a shared util that every route pulls in"* is actionable. Always give the second form. The analyzer's treemap tells you which module owns the bytes.

## Judging a dependency

```bash
lazysitter fe-index signals --rule PERF-HEAVY-IMPORT
lazysitter fe-index dup --kind util          # does a local equivalent already exist?
```

Ask, in order:
1. **Does the repo already have something that does this?** The cheapest rejection. Two date libraries or two HTTP clients in one bundle is the most common avoidable weight.
2. **What does it weigh, and does it tree-shake?** ESM with `sideEffects: false` generally does; CJS-only generally does not. A package can advertise ESM and still pull everything through a barrel index — measure rather than trust the badge.
3. **Is it runtime or build-time?** A build-time plugin has no bundle cost at all. This distinction most often makes a "heavy" dependency fine.
4. **What does it buy?** 40KB for a correct date/timezone/currency implementation is usually worth it. 40KB for "capitalize the first letter" is not. Correctness-critical, edge-case-heavy domains justify weight; convenience does not.
5. **Can it be loaded lazily?** A dependency used only inside a modal or an export flow can be dynamically imported and cost nothing on first load.

## The recurring offenders

| pattern | fix |
|---|---|
| `import _ from 'lodash'` | `import get from 'lodash/get'`, or a native equivalent |
| `import moment from 'moment'` | date-fns / dayjs / `Intl` — moment bundles every locale and is unmaintained |
| `import { Icon } from '@mui/icons-material'` | import each icon by path; the barrel can pull thousands of modules |
| a whole icon set for three icons | inline the three as components |
| `import * as X from` a big barrel | named imports the bundler can shake |
| a polyfill for browsers you do not support | check the browserslist target |

## Split at the right seams

**Split**: route entries · a modal or drawer's contents · a heavy editor, chart, or map library · an admin-only area · anything below the fold and rarely used.

**Do not split**: anything that renders on first paint. You have added a network round trip and a spinner to the critical path to save bytes the user needed anyway.

Prefetch on intent — hover or focus of the trigger — so the lazy chunk is usually already there by the time it is needed.

## Duplicate dependencies

Two versions of the same package in one bundle is pure waste and a source of subtle bugs (two React copies, two context instances). Check the lockfile for duplicates and dedupe. In a monorepo this is common and easy to miss.

## What to check in CI

A size-limit style budget per entry, failing the build on regression, is the only thing that stops slow growth. A budget checked once at review time and never again drifts back within a quarter.

## Checklist

```
## Bundle — <feature>
## Budget (KB gz per affected entry)
## Measured delta (before → after, per chunk, per route) — or cannot-verify-offline
## Attribution (what grew — because of what — path:line)
## Dependencies added (name — weight — tree-shakes — runtime|build — already-have-equivalent — verdict)
## Lazy-loaded (what — trigger — prefetch on intent?)
## Not split, deliberately (what renders on first paint)
## Duplicate packages in the lockfile
## Verdict vs budget (number vs number)
```
