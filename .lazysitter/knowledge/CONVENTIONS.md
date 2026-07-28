# LazySitter — Conventions (committed knowledge)

**Security — read first (D-20).** This file supplies commands that `lazysitter-recon` executes at
Tier-0 preflight (C7) — a tracked, committed file driving code execution on every run, exactly the
same class of risk `SECRETS-BASELINE.md` already carries. It inherits that file's treatment
verbatim: **any diff touching this file is a flagged, never-auto-approved change, even under
`--auto`.** This does not make the surface safe — it puts a human in front of the only path by
which a committed file executes arbitrary code (L-20).

**Assertion execution is OPT-IN, shipped OFF.** `recon` does NOT run a single row-shape-2
`ASSERTION`/`PAIRED-POSITIVE` unless `executeKnowledgeAssertions` is set `true` in the adapter's
`lazysitter.config.json` (default `false`). Turning it on means commands committed in this repo
run on your machine at every preflight — the same trust model as a CI config or a `package.json`
script; enable it only for repos you trust. While it is off, every row-shape-2 row is marked
`unverified-not-executed` and is excluded from the trust path exactly like a `STALE` row — never
silently trusted downstream.

Populated and re-verified by `lazysitter-explorer` (row shape 1, migration decisions) and
`lazysitter-recon` (row shape 2, executable claims — executed at Tier-0 preflight). The two shapes
below are not interchangeable — do not mix their formats.

## Row shape 1 — Migration decisions (FACT-BLOCK answers — C4)

Written once, by `explorer`, when a `FACT-BLOCK` resolves which of two competing repo conventions
is canonical for new code (see C1/C4). Every claim in this shape MUST carry, on the same line or
the line directly beneath it:
- the probe command that produced it,
- the hit count that command returned,
- at least one `path:line` citation,
- the commit SHA the probe was run against ("verified-at").

A claim without all four is not a fact — mark it `⚠ unverified` and do not rely on it.

Cite a Jira issue by **key only** (e.g. `PROJ-123`) — never quoted ticket text.

### Format (row shape 1)

```
<convention> — probe: `<command>` — hits: <n> — <path:line>[, <path:line> ...] — verified-at: <sha>
```

## Row shape 2 — Executable knowledge rows (C6)

Every other convention in this file — the six named sections below, and any category the team
adds — is a claim you cannot write down unless you can express it as a command that either
succeeds or fails. If a claim is genuinely unverifiable (a temporal property — e.g. socket-driven
invalidation ordering — with no passing shell command), it goes in the `unverifiable` shape below
instead of being silently dropped: this is what stops B3 from forbidding exactly the defect class
B11 exists to catch.

```
CLAIM | path:line | ASSERTION | PAIRED-POSITIVE | last_verified | status
```

`status` is exactly one of `live | STALE | unverifiable | unverified-not-executed`.

- **`ASSERTION`** is a command that must succeed for the claim to hold. A **negative** assertion
  (one that expects ZERO hits — e.g. "nobody calls the old client anymore") is **invalid without a
  `PAIRED-POSITIVE`**: a second probe proving the pattern it checks for is still findable at all
  (hits > 0 on a live, related symbol). A grep that finds nothing cannot, by itself, distinguish
  "convention upheld" from "the symbol was renamed, the file was deleted, or the pattern rotted."
- If the `PAIRED-POSITIVE` returns 0 hits, the pattern itself has rotted: the row goes `STALE`,
  **never** `live`, regardless of what the negative `ASSERTION` returned.
- **`STALE` rows are excluded from the context pack.** A stale row is never silently trusted as a
  fact by any downstream agent — a failing assertion IS the staleness signal, no separate
  mechanism needed.
- **`unverified-not-executed` is the default state whenever `executeKnowledgeAssertions` is off**
  (the shipped default). `recon` does not run the row's `ASSERTION`/`PAIRED-POSITIVE` in that
  case; the row is excluded from the trust path exactly like `STALE` — never silently trusted —
  until a maintainer turns the flag on and a later run actually executes it.
- **`unverifiable` rows are kept, not refused.** A property with no passing shell command (a
  temporal ordering guarantee, "stale data with no error anywhere") is exactly the class B11's
  `data-layer-expert` exists to catch — refusing to record it would lose the highest-value
  knowledge, not the noisiest. An `unverifiable` row carries `owner: <human>` and
  `expires: <ISO date>` in place of `ASSERTION`/`PAIRED-POSITIVE`, is excluded from the automatic
  trust path (it never satisfies an assertion-backed claim on its own), and is surfaced to its
  owner when `expires` passes.

### Format (executable row, row shape 2)

```
<claim> — <path:line> — assert: `<command>` — paired-positive: `<command>` (hits: <n>) [omit only
  for a claim whose ASSERTION is itself positive, i.e. expects hits > 0] — last_verified: <sha> —
  status: live|STALE|unverified-not-executed
```

### Format (unverifiable row, row shape 2)

```
<claim> — <path:line> — owner: <name> — expires: <ISO date> — status: unverifiable
```

## Who executes what (C7)

`lazysitter-recon` re-runs every `ASSERTION` and `PAIRED-POSITIVE` in this file at Tier-0
preflight, every run — **but only when `executeKnowledgeAssertions` is `true`** in the adapter's
`lazysitter.config.json` (default `false`, shipped off). When the flag is off, `recon` executes
NONE of these rows; every row-shape-2 row is instead marked `unverified-not-executed` and excluded
from the trust path exactly like `STALE`, never silently trusted. When the flag is on, `recon`
already holds `Bash` and already re-executes every run (A1/C3): a failing `ASSERTION`, or a
zero-hit `PAIRED-POSITIVE`, flips the row's `status` before anything downstream reads it.
**`explorer` does NOT execute row-shape-2 assertions**, on or off — its Bash stays bound
by the C5 probe allowlist below, which excludes `dotnet build`, `npm test`, and any exit-code
test; no exemption is granted to it. Because assertion execution, when enabled, happens at Tier-0
from a committed file, and — unlike the C5 allowlist below — those commands are deliberately
unconstrained, this file carries the never-auto-approve banner at the top of this document
regardless of the flag's current setting.

## Probe allowlist (C5 — binding on every probe explorer re-runs; row shape 1 only)

Only these command heads may be re-run from a committed probe: `git log`, `git branch`,
`git ls-files`, `git rev-parse`, `grep`, `rg`, and glob expansion. A probe is REJECTED if it
contains `;`, `&&`, `||`, `|`, `>`, a backtick, or `$(`, names `curl`, `wget`, `npm`, `node -e`,
`sh -c`, or `python -c`, or contains `-c` (a git/shell config-injection flag, e.g.
`git -c alias.x=...`), `alias.`, `bash -c`, `--upload-pack`, `--exec`, or `--output`. Arguments are
passed literally — NEVER build a probe by concatenating requirement or ticket text. **A malformed
probe BLOCKs; it is never silently executed and never silently skipped.** This allowlist governs
row shape 1 (migration decisions) only — row shape 2's `ASSERTION`/`PAIRED-POSITIVE` commands,
executed by `recon`, are NOT bound by it (see "Who executes what," above).

**This allowlist is a prose mandate enforced by the agent reading it, not a parser LazySitter
ships.** It constrains a cooperative agent re-running a committed probe; it is not a security
control against a hostile committed file exploiting `git`'s own config-driven hook/alias
re-execution (e.g. a repo's `.git/config`). Proven concretely: `git -c "alias.probe=!bash
payload.sh" probe` has an allowlisted head (`git`), no banned metacharacters, and names no
banned binary in the command string itself, yet achieves arbitrary execution this way.

---

## Date / number formatting

(none recorded yet)

## JSON casing

(none recorded yet)

## Enum wire values

(none recorded yet)

## Error shape

(none recorded yet)

## Logging

(none recorded yet)

## Null handling

(none recorded yet)
