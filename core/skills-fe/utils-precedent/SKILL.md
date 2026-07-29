---
name: utils-precedent
description: Find existing hooks, utils, formatters and validators — including renamed copy-paste clones no name search can find — and record the repo's real conventions for dates, numbers, errors and null handling. Load before creating any hook or utility.
---

# Hook and util precedent

Components get the attention; **the duplication that rots a frontend codebase lives below them**. The fourth `getInitials`, the third `useDebounce`, two date formatters that disagree about timezones. None of these is findable by name.

## Structural clone detection

```bash
lazysitter fe-index dup --kind util
lazysitter fe-index dup --kind hook
```

The index alpha-normalizes each function before comparing: every identifier collapses to a placeholder, while keywords, operators and literal *kinds* are preserved. The resulting 5-gram shingle sets are compared by Jaccard similarity. **Two functions that differ only in variable and parameter naming produce identical shingles.**

That is why `formatMoney(cents, currency)` and `toCurrency(amount, code)` land in the same cluster despite sharing no identifier. No grep, and no fuzzy name match, connects them.

**A shingle match is a strong signal, not proof of identical semantics.** Open both and confirm — the edge cases are where they diverge, and the divergence is usually the reason someone wrote the second one. Report the delta; "near-duplicate" with no delta is not actionable.

## Search by shape, not only by name

```bash
lazysitter fe-index precedent "currency formatting" --kind util
lazysitter fe-index query --kind hook --like "debounce"
lazysitter fe-index query --has-hook useEffect --kind hook   # hooks with effects
lazysitter fe-index who useDebounce                          # real adoption
```

## The convention bank — record these every time

These are the places a new util silently disagrees with the existing forty call sites, and **none of them is written down anywhere in the repo**. Record each with `path:line` and a call-site count:

| convention | the question it settles |
|---|---|
| **date/time formatting** | which library, which format strings, and **which timezone is assumed** |
| **number/currency** | locale source, decimal handling, cents-vs-units at the boundary |
| **string casing on the wire** | camel vs snake, and where the conversion happens |
| **error shape the UI renders** | what a caught error looks like by the time a component shows it |
| **null / undefined / empty string** | which one means "absent", and what renders for it |
| **id generation** | uuid, nanoid, incrementing, server-assigned |
| **storage keys** | prefix, namespacing, versioning |

A feature that formats a date differently from the rest of the app is a defect users notice and reviewers do not.

## Hook contracts specifically

For each candidate hook, record:
- **What it returns** — tuple, object, or single value. An object return that is a fresh literal every render breaks any caller that puts it in a dependency array.
- **Identity stability** — is the returned function/object stable across renders? A hook that is not stable is a hook callers cannot memoize against.
- **What it subscribes to** — and whether it tears down. `fe-index signals --rule LEAK-NO-TEARDOWN` finds the leaky ones. **A leaky hook is inherited by every consumer**, so flagging it matters more than flagging a leak in one component.
- **Its rules-of-hooks safety** — does it call hooks conditionally internally? That makes every caller unsafe too.

## Cite the same way as components

```
<new-path>::<symbol> — category: <cat> — chose: #1 <path:line>
<new-path> — NONE-EXISTS — proof: `fe-index precedent "..."` — hits: 0
```
Off-`#1` needs a stated reason. `NONE-EXISTS` needs the recorded query.

## The two highest-value findings to report every run

1. **A cluster where rank #1 has all the call sites and rank #2 has one.** The rank-#2 copy is almost always a fork someone made instead of importing — often because rank #1 lived somewhere they could not import from, or did not quite fit. Naming it is how the repo stops growing a third.
2. **Orphaned hooks and utils** (`fe-index orphans`) — exported and never imported. Dead weight, and frequently a previous attempt at your exact task, with notes.

## When a local helper beats a dependency

A 15-line local utility with a test often beats a 40KB dependency — and often does not. Decide with the numbers: what the package weighs, whether it tree-shakes, whether the repo already has an equivalent, and how much correctness the package buys. Date, timezone and currency handling are the classic cases where the dependency is worth it; "get the first letter of each word" is not.
