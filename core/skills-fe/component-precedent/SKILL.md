---
name: component-precedent
description: Decide reuse-vs-create for a component with evidence — build a ranked precedent set from the index, detect the mid-migration case, and cite by rank. Load before creating any component, and when auditing whether a created one should have existed.
---

# Component precedent and the reuse decision

## The failure this prevents

Citing *a* sibling is laundering. Six confirm-dialogs in a repo means six citable precedents, and citing the fourth is a correct, verifiable citation that still ships the seventh duplicate. A reuse rule that accepts any citation prevents nothing.

The fix is a **ranked** set: find every equivalent, rank them mechanically, and require a stated reason for choosing anything other than rank 1.

## Build the set

```bash
lazysitter fe-index precedent "<category>" --kind component
```

Categories are functional, not structural: `confirm dialog`, `data table`, `empty state`, `form field`, `toast`, `drawer`, `date picker`, `avatar`. Run one per category the feature needs. **Never stop at the first hit.**

Widen with the shape-based queries when the name-based one is thin — the duplicates that matter are often named nothing alike:
```bash
lazysitter fe-index query --props onConfirm,onCancel     # by prop contract
lazysitter fe-index dup --kind component                 # by structural similarity
```

The clustering weights prop-contract overlap highest and name similarity lowest, deliberately. `ConfirmDialog` and `AreYouSureModal` share five of six props and land in one cluster; no name search would ever connect them.

## The ranking rules (mechanical, not editorial)

1. **Dominance first** — call-site count. What the codebase actually uses is what new code should imitate.
2. **Recency second** — newest-blame date breaks ties.
3. **A deprecation-signalled candidate never ranks 1.** Demote it below the first live candidate regardless of hit count. Signals: a `@deprecated` tag, a `Legacy`/`Old`/`V1` name, or absence from every recently-touched file while a rival shape appears in all of them.

## `clusters: >= 2` is a migration signal — raise it, do not resolve it

Two live competing conventions means the repo is **mid-migration**. And mid-migration, the **legacy** shape usually has *more* call sites, precisely because it predates the migration. Ranking by dominance alone would therefore recommend imitating exactly what the team is migrating away from.

This is not yours to settle by argument. Which convention is canonical for new code is a `fact` question with a real answer, and an architect ruling on a `fact` dispute manufactures agreement. **Raise a `FACT-BLOCK`**: *"the repo has two live conventions for `<category>` — which is canonical for new code?"* One human line settles it.

Then record the answer in `.lazysitter/knowledge/CONVENTIONS.md` with receipts — the query, the hit counts, `path:line`, and the SHA it was verified at. A later run reads the recorded answer instead of asking again.

## Citing

```
<new-path>::<Symbol> — category: <cat> — chose: #1 src/ui/ConfirmDialog.tsx:13
<new-path>::<Symbol> — category: <cat> — chose: #2 src/ui/Sheet.tsx:9 — reason: #1 is deprecation-signalled
<new-path> — NONE-EXISTS — proof: `fe-index precedent "bulk selector"` — hits: 0
```

**An unreasoned off-`#1` pick is invalid.** Legal reasons: rank 1 is deprecation-signalled, or the plan's frozen contract requires a genuinely different shape. "I preferred the other one" is not a reason — the seventh confirm-dialog was always going to be cleaner than the six before it.

The reviewer opens the file at the cited line and checks the rank, so a fabricated or approximate citation is caught mechanically rather than doubted.

## `NONE-EXISTS` needs proof

Record the query and its zero result. **An unrecorded search is indistinguishable from not searching.** Also record what you searched *for* — a `NONE-EXISTS` on `"bulk selector"` is not evidence about `"multi-select"`.

## Beyond "which one" — what the set also tells you

- **Comment density** of rank 1 — the number the implementer must match, instead of inventing a blanket zero.
- **Composition convention** — do the top candidates use compound components, render props, or flat prop bags? Follow what dominates.
- **Directory convention** — where components of this kind actually live, from the top candidates' paths, not from a README nobody follows.
- **Prop vocabulary** — the names siblings use for the same concepts.
- **Orphans in the area** (`fe-index orphans`) — an exported component nothing renders is very often the abandoned first attempt at exactly what you are about to build. Read it before building it a second time.

## When creating is right

Reuse is the default, not a rule to satisfy dishonestly. Creating is correct when:
- the precedent set is genuinely empty and you proved it;
- rank 1 is deprecation-signalled and the migration target does not cover this case;
- adapting rank 1 would require a **breaking** contract change whose `fe-index impact` cost exceeds building fresh — say the number;
- the existing component is in a package or layer this code may not depend on.

"It doesn't quite fit" is not one of them until you say **what** does not fit and **why a prop would not cover it**. That sentence is how every duplicate in every codebase got written.
