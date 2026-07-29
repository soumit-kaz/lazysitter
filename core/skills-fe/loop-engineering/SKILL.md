---
name: loop-engineering
description: Run a bounded, observable loop — discovery, consensus, auto-fix, or a measured remediation loop — with an honest terminator and a structured round record. Load before starting any repeated round of work.
---

# Loop engineering

Every loop in this pipeline must answer three questions **before** it starts: what counts as a round, what makes it stop, and what the stop actually claims. A loop that cannot answer the third one produces false confidence — "we looked twice and found nothing" reported as "there is nothing".

## Emit a round record, then read it back

Prose instructions to "count rounds correctly" are unenforceable when the model *is* the runtime. So each round appends one JSON line to `<run-dir>/rounds.jsonl`:

```json
{"loop":"discovery","round":2,"yield_new":0,"yield_repeat":7,
 "failure_signature":null,"index_digest":"…","pre_round_head":"a1b2c3",
 "tree_digest":"…","cost_tokens":18400,"terminated_by":null}
```

**Evaluate loop health by reading this file, never by recalling how many rounds ran.** It is the same fix that `gate-state.jsonl` applies to verdicts, for the same reason.

## The terminators, and what each one claims

### `index-exhaustive` — the strong one
The index enumerates every component, hook, util, prop and call site in the repo. When a search has visited every candidate the index holds for a category, the loop is **provably complete for that category**.

This is a genuine completeness claim, and it is available precisely because the frontend index exists. Prefer it wherever the question is index-answerable, and say so — it is the difference between "we stopped finding things" and "there are no more".

### `converged-dry` (K=2) — the honest weak one
For questions the index cannot enumerate — design risks, attack surfaces, UX gaps — stop after **2 consecutive rounds with `yield_new: 0`**.

One dry round can be a bad sample; two consecutive is the cheapest evidence of exhaustion. But **this never means "we found everything"**. A loop that went dry twice may simply have stopped looking in the right place. Report it as a terminator, never as coverage, and say that sentence plainly whenever a dry termination is standing in for exhaustive coverage.

### `signature-repeat` — the anti-thrash terminator
Normalize each failure (strip absolute paths, line numbers, timestamps, temp-dir names, hex digests) and hash what remains. **The same signature across two rounds of the same loop terminates it immediately** and escalates with both occurrences.

It needs no self-attestation, so it cannot be gamed, and it catches a stuck loop at round 2 instead of burning a full retry cap re-attempting a fix that already failed identically.

### `budget-met` — for measured loops
An a11y, perf, or visual remediation loop ends when the **measurement** meets the criterion. Not when someone judges it good enough. The measurement is the terminator.

### `cap` / `budget` / `fact-block` — legitimate, weaker, always disclosed.

## Dedup against everything seen, never against confirmed-only

The subtlest way to build a loop that never terminates: dedup new findings against the *confirmed* subset. A finding the judge rejected then reappears every round, `yield_new` never reaches zero, and the loop runs to its cap.

Dedup against **everything seen this run**, confirmed or not.

## Never loop on a fact — with the anti-laziness guard

If two consecutive rounds fail to change the evidence base — no new fact recorded, no new probe result — that is a **missing observation**, not slow convergence. Raise a `FACT-BLOCK`.

**The guard:** a round may claim `FACT-BLOCK` only if it attempted a **new probe not previously run this loop**, and recorded it in the round record. An index query counts, and is usually the cheapest one available.

Without the guard, a loop learns it can interrupt the user instead of searching. With it, "did not search hard enough" is the default disposition and the loop continues.

## Detect contamination between rounds

There is no state-restore mechanism here, so rounds are **not idempotent by construction**. Each round records `pre_round_head` (`git rev-parse HEAD` at round start) and a working-tree digest.

If either moves unexpectedly between the end of one round and the start of the next, a partially-applied fix is leaking into the next round's diagnosis. **BLOCK and report** rather than re-diagnosing against a moved target. This *detects* contamination; it does not prevent it, and saying so honestly matters.

## Cost

Each round records `cost_tokens`. A single round that re-spawns a large expert panel can dominate a run's cost, so cap per-loop spend explicitly and treat exceeding it as `terminated_by: budget`.

When a loop waits on something external (a CI run, a deploy), derive the poll delay from that check's **measured** cycle time earlier in the run. An 8-minute CI run deserves one ~8-minute check, not eight 1-minute polls returning the same answer.

## Report the terminator, every time

```
## Loop: <name>
rounds: <n> · yield per round: <n, n, 0, 0>
terminated_by: index-exhaustive | converged-dry | signature-repeat | budget-met | cap | budget | fact-block
what this claims: <"complete for this category" | "stopped finding things — NOT proof of exhaustion" | …>
```
The last line is not decoration. It is the difference between a report a reader can rely on and one that quietly overstates its coverage.
