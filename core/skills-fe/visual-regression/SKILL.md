---
name: visual-regression
description: Catch unintended visual change — what to snapshot, how to make snapshots deterministic, how to review a diff, and why the highest-value finding is on a surface the feature never touched. Load when a render harness exists and a change touches shared UI.
---

# Visual regression

## The finding worth the whole setup

A unit test proves a component does what its test says. **Visual regression proves the forty other places that render it still look right.** A padding change in a shared `Button` ripples into every page in the app, and no per-feature review looks at pages the feature did not open.

```bash
lazysitter fe-index impact src/ui/Button.tsx
```
gives you exactly which surfaces to check. **Go and look at those**, not only at the feature's own screens. That is where the unintended diffs are, and finding one is worth more than every intended diff combined.

## What to snapshot

**Snapshot:** component states in isolation (each variant, size, and interaction state) · full pages at key breakpoints · **every state in the UI state matrix** — loading, empty, error, long content · themes if the app themes · RTL if it supports it · focus states, which are otherwise invisible in a screenshot.

**Do not snapshot:** anything with live data · animations mid-flight · anything containing a timestamp, a random id, or a rotating avatar. These produce diffs on every run and train everyone to click "approve".

## Determinism is the whole game

A flaky visual suite is worse than none, because it teaches the team to approve diffs without reading them. Control every source of variation:

- **Freeze time** — a fixed clock, so relative timestamps do not move.
- **Fixed seed data** — no random ids, no `faker` without a seed.
- **Disable animations and transitions** in the snapshot environment, or wait for them to settle.
- **Wait for fonts** (`document.fonts.ready`) — a screenshot taken mid-swap differs every run.
- **Wait for images to decode** — a half-loaded image is a diff.
- **Pin the rendering environment.** Fonts render differently across operating systems; run snapshots in the **same container** locally and in CI, or every developer sees diffs that CI does not.
- **Set an explicit viewport and device pixel ratio.**
- **Mask genuinely dynamic regions** rather than excluding the whole component.

## Thresholds

A strict pixel threshold produces noise from anti-aliasing; a loose one hides real single-pixel misalignments. Start near-strict with a small anti-aliasing allowance, and tighten or loosen based on what actually flakes — not preemptively.

Prefer a **per-snapshot** threshold override for the few genuinely noisy cases over a loose global one, which blinds every check.

## Reviewing a diff — classify, do not just approve

Every diff is one of three things:
1. **Intended** — this feature's own change. Approve and update the baseline.
2. **Unintended** — a regression on a surface the feature did not mean to touch. **The finding.** Investigate before doing anything else.
3. **Noise** — nondeterminism. Fix the determinism problem; do not raise the threshold.

Never bulk-approve. A bulk approval after a shared-component change is precisely how a regression enters the baseline and becomes the new "correct".

## Baseline hygiene

- Baselines live in version control, reviewed like code.
- A baseline update is part of the change that caused it, in the same commit, so the diff and its cause are reviewed together.
- Prune snapshots for deleted components, or the suite slowly fills with images of things that no longer exist.

## When there is no harness

Say `degraded: true` and name the gap. **Do not substitute reading the JSX.** Visual properties are observable, and closing an observable concern by argument is the specific failure the pipeline's observable-claim rule prohibits.

If you can render manually, do — and say you did, listing what you looked at and at which widths. A manual pass honestly described beats an automated claim that did not happen.

## Checklist

```
## Visual regression — <feature>
## Harness (tool + command)
## Coverage (component states · pages × breakpoints · matrix states · themes · RTL · focus)
## Determinism controls (clock · seed · animations · fonts · images · container · viewport/DPR · masks)
## Threshold (value — and any per-snapshot overrides, with reasons)
## Diffs found (surface — INTENDED | UNINTENDED | NOISE — evidence)
## Impact-driven surfaces checked (from fe-index impact — which pages, results)
## Baseline updates (which, in which commit)
## Snapshots pruned (deleted components)
```
