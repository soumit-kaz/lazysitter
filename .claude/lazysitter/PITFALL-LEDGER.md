# LazySitter — Process Pitfall Ledger

Format: `[scope][trigger] symptom → fix | hits | guard`

This ledger holds **process / collaboration faults** the orchestrator has hit — NOT project-tech pitfalls
(those live in `PROJECT-PITFALLS.md` in the target repo and are injected by the explorer). The orchestrator
reads this file at **Tier 0 preflight** so it does not repeat a known process fault.

Two rules keep it cheap and useful:
- **Dedup, don't append.** A repeat fault increments `hits`; it does not add a row.
- **Graduate, don't remember.** A fault with `hits ≥ 2` and no guard is a signal to engineer it away
  (a pipeline rule, a mechanical gate, a shipped default). Once a guard exists, mark the row `graduated`
  and stop acting on it — it stays only for provenance. The point is to make the fault *impossible*, not
  to reread it forever.

You (the orchestrator) may append new process faults you observe during a run, following the same format.

---

## Faults

```
[proc][artifact-persist]   producer output re-transcribed by hand → lost / mislabeled between tiers → producers self-persist to <run-dir>; orchestrator promotes | 2 | graduated (scoped Write + self-persist)
[proc][context-bloat]      full essays carried in orchestrator context → lost-in-the-middle at the gate → externalize; carry pointer + summary + machine verdict; re-read frozen artifacts by path | 2 | graduated (shared substrate + gate-state.jsonl)
[proc][prose-gate]         merge gate decided by parsing prose verdicts → hedged verdict misread → require lsi-verdict block; evaluate gate from gate-state.jsonl | 1 | graduated (structured verdicts)
[verify][observable-claim] observable concern dismissed by reasoning ("labels are clipped") → real bug shipped → observable concerns discharged only by observation (render/behavioral gate); raiser ≠ dismisser | 1 | graduated (observable-claim rule + visual gate slot)
[verify][toothless-test]   teeth check done by eye / skippable → toothless AC passes silently → mechanical teeth-check mode against baseline; ≥1 must-test must FAIL | 1 | graduated (teeth-check mode)
[verify][frozen-drift]     "frozen assertions immutable" trusted, not enforced → hash every frozen test; unlogged change BLOCKS | 1 | graduated (freeze hash guard)
[verify][anchored-adversary] orchestrator fed its bug-theory to red-team/security/intent → confirmation bias → adversaries get FACTS not hypotheses | 1 | graduated (un-anchoring rule)
[test][synthetic-fixture]  short/tidy synthetic fixtures pass happy path, hide real-world bug (long i18n label overlap) → fixtures use worst-case REAL data from context-pack data-shape facts | 1 | graduated (adversarial fixtures + data-shape facts)
[test][guessed-mechanics]  test-author guessed a render library's selectors/animation → test fails for harness reasons → explorer supplies VERIFIED library mechanics; keep intent-blindness | 1 | graduated (verified test-tooling facts)
[env][toolchain-gap]       ran the whole pipeline "verification-degraded" over a missing 6-min toolchain → Tier-0 preflight detects + asks once (never silent, never auto-install) | 1 | graduated (Tier 0 preflight)
[env][push-not-deploy]     release-agent assumed git push = deploy (stale branch trigger) → read deploy topology at Tier 0; release runs the recorded deploy step | 1 | graduated (deploy-topology preflight)
[proc][late-limitation]    known user-facing limitation surfaced only at the intent gate (5 tiers late) → LIMITATIONS.md tracked from discovery; intent gate verifies disclosure | 1 | graduated (limitations ledger)
```
