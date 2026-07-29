---
name: fe-index-query
description: Drive the LazySitter frontend index — the structural map of every component, hook, util, prop, call site and import edge in the repo. Use this INSTEAD of grep whenever the question is "does this exist", "who uses this", "what props does it take", "what would break if I change it", or "is this a duplicate". Load before any frontend exploration, review, or reuse decision.
---

# Querying the frontend index

## Why this exists

`grep -r "ConfirmDialog"` returns matches in a doc comment, a Storybook title, a test fixture, a changelog, and a string literal — and misses `AreYouSureModal`, which is the same component under a different name. It cannot resolve `@/ui` to a real path, cannot follow a barrel re-export, cannot count real call sites, and cannot tell you which of six similar components is canonical.

The index answers all of that structurally. It parses every source file with comments, strings, template literals and regex literals **masked out**, so a match is guaranteed to be real code. It resolves `tsconfig`/`jsconfig` path aliases and Vite/webpack aliases, follows barrel re-export chains, counts JSX call sites, extracts full prop contracts from TypeScript interfaces and destructuring patterns, and clusters near-duplicates.

**Rule: if the index can answer it, the index answers it. Read source only to confirm a specific `path:line` the index gave you.**

## Build it first

```bash
lazysitter fe-index build          # incremental — unchanged files come from cache
lazysitter fe-index build --force  # full rebuild
lazysitter fe-index build --root src,packages/ui   # monorepo: limit the scan roots
```

Rebuilding after a 12-file diff re-parses 12 files. It is cheap. **Rebuild after any code change before auditing** — an index built before the diff cannot see the code the diff wrote, which is exactly where same-run duplicates hide.

## The commands, by the question they answer

### "Does something like this already exist?"
```bash
lazysitter fe-index precedent "confirm modal" --kind component
```
Emits the ranked precedent set in the pipeline's exact format — rank, `path:line`, call-site count, newest-blame date, deprecation signal, prop count, comment density. Ranked by dominance then recency, and **a deprecation-signalled candidate never ranks 1**.

```bash
lazysitter fe-index query --like "date picker" --kind component --min-usage 3
lazysitter fe-index query --props onConfirm,title        # find by prop contract
lazysitter fe-index query --has-hook useQuery            # find by what it uses
lazysitter fe-index query --renders Button               # find by what it renders
```
`query` explains its ranking — the `why` column shows which signal earned each point, so "why is this #1" always has an answer.

### "What props does this take, and which are actually used?"
```bash
lazysitter fe-index props Button
```
Declared props with types, requiredness and defaults, **plus the count of call sites that actually pass each one**. Also surfaces dead prop surface, undeclared props absorbed by `...rest`, and call sites using `{...spread}` (where passed props are invisible). See the `prop-analyzer` skill.

### "Who uses this?"
```bash
lazysitter fe-index who Button        # every call site + the props passed at each
lazysitter fe-index impact src/ui/Button.tsx   # transitive blast radius + routes hit
```
`impact` is the number to have before touching anything shared — it walks the reverse import graph hop by hop and names the routes affected.

### "Are we duplicating things?"
```bash
lazysitter fe-index dup --kind component   # clusters by prop-contract similarity
lazysitter fe-index dup --kind util        # clusters by normalized-token shingles
lazysitter fe-index dead-props             # components whose API drifted from usage
lazysitter fe-index orphans                # exported, never used
lazysitter fe-index drill                  # props drilled through 3+ components
```
Component clustering weights **prop-contract overlap** highest and name similarity lowest — that is deliberate, because the duplicates worth finding are the ones nobody named alike. Util/hook clustering alpha-normalizes identifiers before hashing 5-grams, so two functions differing only in variable names produce identical shingles.

### "What is mechanically wrong here?"
```bash
lazysitter fe-index signals --severity high
lazysitter fe-index signals --rule A11Y --file src/features/
lazysitter fe-index signals --rule REACT-CONDITIONAL-HOOK,NEXT-MISSING-USE-CLIENT
lazysitter fe-index rules      # the full rule catalogue
```
Every finding carries `path:line`. **Findings marked `[heuristic]` must be confirmed by reading the file** before you treat one as a fact — say so when you cite one.

### "What is this project built on?"
```bash
lazysitter fe-index stack
```
Framework and version, router mode, TypeScript, state and server-state libraries, styling system, UI kit, forms, i18n, testing, a11y tooling, perf tooling, visual tooling, bundler, monorepo layout.

Add `--json` to any command for machine-readable output.

## Reading the output honestly

- **`usageCount: 0` does not mean unused.** It means no JSX call site inside this repo. A package export, a dynamic `import()`, or a string-keyed registry lookup all show as zero. Confirm before recommending deletion.
- **`{...spread}` call sites hide props.** When `props` reports spread call sites, the "passed at N call sites" numbers are a lower bound.
- **`unresolvedTypes`** means a prop type is declared in another file the index did not follow into. The prop list is still right; the types are incomplete.
- **`coverage.skipped` and `coverage.parseErrors` in `meta.json`** are the index's own disclosed blind spots. Check them before claiming exhaustive coverage — a category can be empty because nothing exists, or because the file was skipped.
- **Cite the index digest** with any finding that rests on the index, so a stale-index finding is detectable rather than invisible.

## Loop termination this enables

Component, hook, util, prop and call-site questions are **enumerable** — the index holds every one. A discovery loop over them terminates `index-exhaustive`, which is a genuine completeness claim for that category, unlike `converged-dry` (K=2), which only claims the loop stopped finding things. Use the strong terminator where the question is index-answerable, and say which one fired.
