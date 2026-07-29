---
name: agent-supervision
description: Watch in-flight agents and intervene when one drifts — intent contracts, the intervention inbox, quarantine, and an honest account of which mechanisms actually enforce. Load when running a parallel wave, or when an agent looks like it is going the wrong way.
---

# Supervising running agents

A subagent that misreads its brief burns its entire budget before anyone finds out. Judging output afterwards is necessary and insufficient — by then the cost is paid and the wave is late.

Three mechanisms, and **they are not equally strong**. Say which is which whenever you report on supervision; claiming cooperative control is structural is the failure mode this skill exists to prevent.

## 1. The intent contract — structural

Every agent emits this **before** any substantive work:

```
## INTENT-CONTRACT
files-i-will-touch: <explicit paths, or NONE>
index-rows-i-will-cite: <entity ids / precedent ranks>
questions-i-am-answering: <1-3 lines>
out-of-scope-for-me: <what I will NOT do>
checkpoints: <where I will re-read my inbox>
```

It costs almost nothing and it converts drift detection from a judgement call into a comparison. **An agent that touches a file absent from its own contract has drifted by its own declaration** — no interpretation required.

Write each contract to `<run-dir>/supervision/intent-<agent>.md` so it survives the agent's context.

## 2. The intervention inbox — cooperative

Every agent's brief includes: *"At each checkpoint you declared, re-read `<run-dir>/supervision/INBOX-<your-name>.md`. If it exists and is non-empty, it overrides your current direction. Obey it, or STOP and report why you cannot."*

Three directives:
- **`REDIRECT`** — the goal is right, the path is wrong. Correction plus reason; the agent adjusts and continues.
- **`NARROW`** — real work, sprawling scope. Cut to a named subset.
- **`ABORT`** — the premise is wrong. Stop, report what you have, touch nothing further.

**This is a prose mandate honoured by a cooperative agent, not a sandbox.** It cannot stop an agent that ignores it. It is still the most valuable of the three in practice, because the common case is an agent that is *confused*, not hostile — and for that agent, a correction delivered mid-flight saves the whole run.

Where the runtime supports background tasks and task-stop, ABORT becomes structural. Say whether it did this run.

## 3. Quarantine — structural, the backstop

When an agent returns having ignored a directive, or its output contradicts its own contract: **do not promote it.** The output is not passed downstream, not written into the substrate, not cited.

Quarantine needs no cooperation from the agent — you simply refuse to use what it produced. Log it in `DECISIONS.md`, then re-spawn with a corrected brief or route the work elsewhere.

**An unlogged quarantine is invisible** — it looks identical to work that was never done. Always record it.

## Drift signals that justify intervention without further evidence

- The agent is about to create something the index shows has a rank-`#1` precedent it never queried. **Run the query yourself** — one command settles it.
- Its touched-files set has escaped the plan's ownership map, or collides with a sibling agent running in the same wave. Collisions are the expensive case: two implementers editing one file produce a plausible-looking result nobody designed.
- Two consecutive rounds with no new fact **and** no new probe attempted — a missing observation, not slow progress.
- An explorer reading source files wholesale instead of querying the index; it is about to spend its whole context re-deriving what one command answers.
- An adversary (red-team, devil's advocate) arguing the plan's merits instead of attacking it — role inversion, and it is drift even when the argument is good.
- The agent has started answering a question nobody asked it.

## When NOT to intervene

`ON-TRACK` is the correct verdict most of the time, and saying so plainly is doing the job.

- **Do not manufacture a concern to look useful.** A false REDIRECT costs a real agent a real restart.
- **"I would have built it differently" is not drift.** Substituting your own architectural preference for the architect's decision is itself out of scope.
- **Not on style, naming, or comment wording.**
- **Not on a disagreement one index query would settle** — run the query first.

## Reporting

```
## Supervision — wave <n>
## Enforcement level available (structural task-stop | cooperative inbox only) — and why
## Per agent: ON-TRACK | REDIRECT | NARROW | ABORT | QUARANTINE
   reason · evidence (path:line, index query + result, ownership-map row) · directive written to
## Collisions (file — contending agents — resolution)
## Interventions issued (count by type)
## Quarantines (agent — what was discarded — what replaced it)
## Standing risks for the next wave
```

The **enforcement level line is mandatory**. A supervision report that implies structural control it did not have is worse than no report, because the reader takes the drift risk to be covered when it was not.
