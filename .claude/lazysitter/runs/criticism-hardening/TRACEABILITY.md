# TRACEABILITY — must-AC coverage

Frozen suite: `test/criteria.js`, sha256 `77a80a23...`, 50 ACs / 527 assertions.
Teeth check PASSED mechanically: 397 failures at pre-implementation baseline.

| stage | failures |
|---|---|
| baseline (teeth check) | 397 |
| after W0-W4 | 248 |
| after W5-W6 | 41 |
| after W7 | 33 |
| after W8-W9 | **32** |

## Adjudication of the residual 32
`lazysitter-code-reviewer` (independent) adjudicated the 41-failure set with quoted `path:line`
evidence: **12 REAL DEFECTS** (all fixed in W7/W8) and **29 TOOTHLESS/MIS-SPECIFIED** assertions —
cases where the feature IS present and correct but the blind test asserted an exact phrasing the
implementation expressed differently (e.g. "not spawned" vs "do not spawn it"; "outside the project
tree" vs "never anywhere inside the repo tree"; `override.{0,20}logged` vs "logged override").

The suite is FROZEN and may not be edited to pass — that is the point of freezing it. The residual
32 are therefore permanent and disclosed rather than resolved.

## Known-wrong assertions (test defect, not code defect)
- **AC-49** asserts a roster `tier` value of `high_alt` exists. Verified against
  `git show HEAD:core/roster.json`: `high_alt` was NEVER a tier value, at baseline or now. It is
  expressed as `distinctModel: true` on `lazysitter-red-team` and resolved to a model slot only in
  the installed adapter configs. The assertion's premise is factually wrong.
- **AC-32** enforces pre-amendment wording. DECISIONS.md D-2 amended it after the devils-advocate
  proved the original A12 wording would have caused a net deletion of a never-skip guarantee.
  Correctly fails; the amendment is honored and mechanically asserted in `test/smoke.js`.
- **AC-7** reported plan-attack ordering as wrong. VERIFIED-FALSE by the code-reviewer: the actual
  Tier 4 -> Tier 5 ordering is correct; the test's regex matched an unrelated ground-rules sentence
  earlier in the file.

## Honest conclusion
Blind acceptance tests written against unwritten prose produce a high false-positive rate on exact
phrasing. That is itself a finding about this framework's Tier-3/Tier-6 design and belongs in the
next criticism cycle.

## Round 2 delta — 32 -> 37 failures, fully accounted

| stage | failures |
|---|---|
| after R1 (W8-W9) | 32 |
| after R2 (W1-W3) | **37** |

The +5 are exactly the roster-count assertions, and every one is **superseded by an explicit
decision**, not a regression:

- `AC-1 [claude]`, `AC-1 [codex]`, `AC-1 [cursor]` — assert exactly 27 agents; roster is now 28.
- `AC-49` — asserts `roster.agents` has exactly 27 entries and `core/agents/*.md` has exactly 27 files.

R2 adds `lazysitter-reuse-auditor` by ruling (PLAN-R2 rev 2, C17). The frozen suite encodes the
A1-A17 roster and cannot be edited to pass — that is what freezing means. The correct disposition is
SUPERSEDED-BY-DECISION, recorded here, not a softened assertion.

The other 32 were adjudicated after R1: 12 were real defects (fixed in W7/W8) and the remainder are
mis-specified blind-test phrasings, proven with quoted `path:line` evidence by an independent
code-reviewer. `AC-49`'s `high_alt` clause remains factually wrong — `high_alt` was never a roster
`tier` value at any commit; it is expressed as `distinctModel: true`.

**Standing finding for the next criticism cycle:** blind acceptance tests written against unwritten
prose produce a high false-positive rate on exact phrasing, and freeze semantics mean a later,
better decision shows up as a permanent red. That is a real cost of the Tier-3/Tier-6 design and it
should be adjudicated rather than explained away each round.

## W9 gate-closure correction — the "37, fully accounted" claim above was wrong; recounted at 38, now fixed back to 37

An independent code-reviewer BLOCKed the round that produced the "32 -> 37, fully accounted" entry
above: `AC-50` ("no code comments introduced, `git diff` vs HEAD, `core/src/bin *.js`) was ALSO
failing at that point, because the Fable guard (W8) and the oversized-file guard (W8/W9) had added
explanatory `//` comment blocks to `src/doctor.js`, `src/gitignore-check.js`, `src/util.js`, and the
same class of comment had accumulated in `src/context.js`, `src/detect.js`, `src/frontmatter.js`,
`src/install-claude.js`, `src/install-codex.js`, `src/install-cursor.js`, `src/roster.js`, and
`src/version.js`. That is a **38th failure the "fully accounted" narrative above never counted** —
the round-2 close mistook a green `test/smoke.js` (327+ passing structural assertions) for a green
`test/criteria.js`, and never re-ran the frozen suite after the R2 edits landed, so the AC-50
regression shipped unnoticed.

| stage | failures |
|---|---|
| after R2 (W1-W3), as claimed above | 37 |
| **actual, before this correction (AC-50 also firing)** | **38** |
| after this correction (comments removed from all `src/*.js`) | **37** |

**Disposition: AC-50 is FIXED, not superseded.** Every comment the Fable guard and the
oversized-file guard waves added to `src/*.js` has been removed; `src/*.js` is verified at
`grep -rn "^\s*//" src/*.js | wc -l` → `0` (leading-`//` and trailing-inline and `/* */` forms all
checked, not just the leading form). This is a real defect that is now corrected, not a stale
assertion being explained away — the user's explicit hard constraint for this repo ("no code
comments") governs `src/*.js` directly; the corrected C5 density rule cited in the R2 entry above
governs *target* repos LazySitter builds features in, not LazySitter's own source.

The failure count after this fix is **37**, numerically identical to the round-2 entry above but for
the correct reason: the 37 are exactly the same 32 (R1, adjudicated: 12 real defects fixed in
W7/W8, remainder toothless/mis-specified phrasing) plus the same 5 roster-count assertions
(superseded by the R2 `lazysitter-reuse-auditor` decision, C17) — re-verified against the current
tree, not carried forward by assumption. `AC-50` is no longer in the failing set.

**Process finding for the next criticism cycle:** re-running `node test/criteria.js` (not just
`node test/smoke.js`) after every wave that touches `src/*.js`, `core/`, or `bin/` is a load-bearing
step, not an optional one — a green smoke suite is not evidence of a green frozen suite, and the
round-2 close skipped it.
