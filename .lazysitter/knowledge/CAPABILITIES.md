# LazySitter — Capabilities (committed knowledge)

Drift-diff target and audit record only. `lazysitter-recon` RE-EXECUTES its probe every run — no
gate may read a capability state from this file (C3). This file exists so a human, or a later run,
can see what changed since the last probe; it is never authority for the CURRENT run's decisions.

Format: one row per capability, appended/updated by `lazysitter-recon` at Tier 0.
`<capability> — <state: available|absent|present-but-inert> — <probe command> — <discovered/executed count> — <run date>`

`present-but-inert` means the command exited 0 while doing zero real work (e.g. a test runner that
discovered 0 tests). Treat it as WORSE than `absent`, never as a pass.

Cite a Jira issue by **key only** (e.g. `PROJ-123`) — never quoted ticket text.

---

## Build / Test / Lint

(none recorded yet — populated on first run)

## Deploy topology

(none recorded yet — does `git push` deploy, or is there a separate step? is it non-interactive?)

## Branch inventory

(none recorded yet)

## CI presence

(none recorded yet)

## Observability surface

(none recorded yet)

## Model-tier separation

(none recorded yet — degraded if `high_alt` is unset or equals `high` on any adapter; this blocks
any downstream claim of red-team blind-spot independence)

## Drift log

(each run appends a one-line diff against the prior state here; never overwritten)
