# LazySitter — Secrets Baseline (committed knowledge)

Scope: rows are populated from `git ls-files` output ONLY — tracked files, never the untracked
working tree. `lazysitter-secrets-scanner` baselines once and reports delta-vs-baseline on every
run; unresolved pre-existing criticals are surfaced in every final report until fixed or explicitly
accepted. **Any diff touching this file is a flagged, never-auto-approved change** — a PR editing a
tracked knowledge file that a future run re-executes is exactly the attack this rule closes.

## Permitted columns (allowlist — nothing else may appear in a row)

- finding id
- `path:line`
- rule class
- severity
- first-seen SHA
- status
- `sha256(ruleId + ':' + path + ':' + line)`

## Forbidden — ABSOLUTELY, no exceptions

This file may **NEVER** carry:
- the matched value itself,
- any masked, truncated, or otherwise redacted form of the matched value,
- the surrounding source line (even with the value stripped out),
- any hash derived from the matched value (only a hash of `ruleId + path + line` is permitted —
  never a hash that could be used to confirm a guessed value).

**Untracked-path hits are reported in-run only.** They are recorded here solely as a withheld
count (`untracked-hits: <n>`), never as a path — a secret living in a gitignored file is
deliberately under-recorded in this baseline rather than exposing its location.

An `accepted` status requires `accepted-by:` + an ISO date + a rationale on the SAME row.

Cite a Jira issue by **key only** (e.g. `PROJ-123`) — never quoted ticket text.

## Format

```
<finding-id> — <path:line> — <rule class> — <severity> — first-seen: <sha> — status:
  new|accepted|fixed [accepted-by: <name> — <ISO date> — <rationale>] — hash:
  sha256(ruleId:path:line)
```

---

## Baseline

(none recorded yet)

untracked-hits: 0
