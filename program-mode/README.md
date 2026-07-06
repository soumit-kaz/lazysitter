# LazySitter Program Mode — engine

The deterministic, token-free core that turns LazySitter from a single-feature pipeline into a
multi-feature, multi-session **enterprise program** engine. This is **Phase 1** of
[`docs/PROGRAM-MODE.md`](../docs/PROGRAM-MODE.md) §16 — the load-bearing substrate the rest of
the beast sits on. It is **additive**: it never touches the single-feature (`/lsi`) pipeline.

## Why it exists

The whole thesis (`docs/PROGRAM-MODE.md` §0): move every checkable property from a *judgment*
(an agent decides — ~0.1% wrong, token-costly) to a *proof* (a deterministic check — 0% wrong,
~0 tokens). This engine is the proof layer: graph scheduling, quality gates, institutional
memory, durable state, and leases — none of it spends a token, all of it is testable.

## Layout

```
program-mode/
  lib/plan.js        — the PROGRAM-PLAN DAG: nodes, edges, statuses, contracts, checkpoints
  lib/scheduler.js   — cycle detection, topological waves, critical path, contract-first readiness,
                       disjoint-file concurrency selection
  lib/gates.js       — the fail-fast deterministic gate ladder + lsi-verdict emission
  lib/gatecmds.js    — real gate commands: JS-native secrets scan (zero-dep) + external tool
                       adapters (eslint/tsc/knip) that degrade to BLOCK when a tool is absent
  lib/memory.js      — institutional memory: dedup, O(K) situation×producer retrieval, graduation
  lib/librarian.js   — milestone consolidation: merge dupes, retire stale, prune noisy, metrics
  lib/registry.js    — trigger-indexed store for specialist rulings/playbooks AND self-built tools
                       (discovery-before-creation, ruling→playbook graduation)
  lib/queue.js       — the async PM decision queue: business-only enqueue, parking, client batch
  lib/trace.js       — the traceability spine BRD-§→feature→AC→test→verdict + coverage/scope-creep gate
  lib/faultinject.js — measures gate coverage by injecting known defects (makes zero-defect falsifiable)
  lib/coordinator.js — disjoint node assignment + crash-reconcile for concurrent sessions
  lib/store.js       — durable git-friendly state (atomic plan writes, append-only JSONL logs)
  lib/lease.js       — claim / heartbeat / expiry for multi-session concurrency
  index.js           — public API
  cli.js             — the surface the Program-Office orchestrator drives (incl. `gate`, `coverage`)
  demo.js            — runnable end-to-end demonstration
  test/engine.test.js · test/engine2.test.js   — 79 assertions
```

## Run it

```bash
node program-mode/demo.js            # end-to-end demonstration
node program-mode/test/engine.test.js  # the proof — 40+ assertions
npm test                             # installer smoke + this engine
```

Drive durable state directly:

```bash
node program-mode/cli.js init
node program-mode/cli.js add schema --cost 4 --files db/schema.sql
node program-mode/cli.js add api    --cost 3 --files src/api.js
node program-mode/cli.js dep api schema --on contract   # api starts on schema's FROZEN contract
node program-mode/cli.js ready       # → [schema]
node program-mode/cli.js freeze schema
node program-mode/cli.js ready       # → [api, schema]   (unblocked before schema merges)
node program-mode/cli.js waves       # concurrency layers
node program-mode/cli.js critical    # the long pole
```

State lands in `./program/` and every command is a fresh process that reloads it — that is the
resume/multi-session substrate in action.

## The agent layer

[`core/orchestrator-program.claude.md`](../core/orchestrator-program.claude.md) (installed as the
`/lsi-program` command) is the **Program Office (Tier -1)** — the LLM orchestrator that drives
this engine: BRD intake → graph → schedule → call `/lsi` per node → gates → the bidirectional PM
membrane → memory. It holds no graph math or gate logic; it routes control and lets the engine
hold facts.

## Design invariants (never break — `docs/PROGRAM-MODE.md` §1)

- **No wall-clock in the engine.** Callers inject `now` (epoch seconds); the CLI reads the clock
  at the boundary. This is what makes resume deterministic.
- **State on disk is the truth; sessions are disposable.**
- **Depend on contracts, not implementations** — the parallelism unlock.
- **A degraded gate is not a passed gate.**
- **Graduate knowledge out of memory** so a gigantic base still costs O(K) to inject.

## What's built vs. what remains

**Built + tested (79 assertions):** the entire deterministic engine — DAG scheduler, gate ladder
with real commands, coverage measurement, institutional memory + Librarian, the specialist/tool
registry, the decision queue, the traceability spine, the concurrency coordinator, durable state,
and leases.

**Remaining — agent-layer, not engine (`docs/PROGRAM-MODE.md` §14):** the BRD-intake parallel
reader fan-out, the live PM decision loop, and worktree/merge wiring for true multi-session
concurrency are orchestrator work the `/lsi-program` command drives. The *mechanisms* they need
(trace spine, queue, coordinator) are already here and proven; what's left is wiring them to live
agents on a real pilot — which the blueprint insists comes before believing any scale claim.
