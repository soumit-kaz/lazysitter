# LazySitter — Project Pitfalls (committed knowledge)

Format: `[scope][trigger] symptom → fix | hits | guard`

This ledger holds **project-tech faults** (framework, library, deploy-target triggers) — NOT the
shipped process/collaboration ledger (`PITFALL-LEDGER.md`, which lives per-adapter and is never
committed here). `lazysitter-explorer` greps this file for rows matching the CURRENT feature's tech
triggers and injects only those matches into the context pack (~5 rows, never the whole file).
Implementers and `red-team` append rows here via their `pitfalls[]` verdict returns.

Two rules keep it cheap and useful:
- **Dedup, don't append.** A repeat fault increments `hits`; it does not add a row.
- **Graduate, don't remember.** A fault with `hits ≥ 2` and no guard is a signal to engineer it
  away (a lint rule, a shared harness, a preflight check). Once a guard exists, mark the row
  `graduated` and stop injecting it — the point is to make the fault impossible, not to reread it
  forever.

Cite a Jira issue by **key only** (e.g. `PROJ-123`) — never quoted ticket text.

---

## Faults

(none recorded yet)
