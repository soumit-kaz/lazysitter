---
name: prop-analyzer
description: Analyse a component's prop contract against how it is actually used — dead props, undeclared props, boolean traps, required-vs-optional balance, spread leakage, and breaking-change cost. Load before designing, reviewing, or changing any component's public API.
---

# Prop analysis

A component's props are its public API. Once twenty files call it, changing them is a migration. This skill turns "does this API make sense" from a taste question into a measurement.

## Get the data first

```bash
lazysitter fe-index props <ComponentName>
lazysitter fe-index who <ComponentName>       # call sites + props passed at each
lazysitter fe-index dead-props                # repo-wide drift
lazysitter fe-index impact <path>             # cost of a breaking change
```

`props` reconciles three sources — the TypeScript interface/type (following `extends` and `&` intersections), the destructured parameter pattern with its defaults, and `defaultProps` — and joins them against **every JSX call site's actual attributes**.

## The seven findings, in order of value

### 1. Dead prop surface — declared, passed at zero call sites
The most reliable "this API has drifted" signal in a mature codebase. Each one is untested code, extra branches, and a promise the component is still keeping to nobody.

Ask, per dead prop: was it *never* adopted, or was it *abandoned*? A prop added last week with no call sites is pending; a prop from two years ago with none is dead. The index gives you the file's newest-blame date to tell them apart. Removing it is a breaking change on paper and a no-op in practice — say exactly that, with the zero, rather than proposing a cautious deprecation for something nothing calls.

### 2. Undeclared props — passed but not declared
Something callers pass that the contract does not name. It is being absorbed by `...rest`, spread onto a DOM node, or silently dropped. All three are worth knowing:
- **absorbed and forwarded to the DOM** — the contract is effectively "every HTML attribute", which is a real decision that should be deliberate;
- **silently dropped** — a caller believes it is configuring something and it is doing nothing. This is a live bug at every one of those call sites.

### 3. Boolean traps
Count props that are boolean-typed or named `is*`/`has*`/`should*`/`show*`/`can*`/`enable*`/`disable*`. **Three or more on one component is a signal.** `<Modal open large danger dismissible />` admits sixteen combinations, most meaningless, none prevented by the type system.

When booleans are mutually exclusive they are a union: `variant="danger"`, `size="large"`. When they are independent but interact, a discriminated union makes the invalid combinations unrepresentable. The test: can you name a combination that compiles and makes no sense? If yes, the axis is wrong.

### 4. Required/optional balance
Many optional props with defaults multiply the states the component can be in and that tests must cover. Few required props that fully determine the render are easier to use correctly and easier to test.

Look for **optional props that are passed at every single call site** — that is a required prop wearing a disguise, and the default is dead code. Making it required is a compile-time-visible change with zero runtime risk.

### 5. Spread leakage at call sites
When `props` reports call sites using `{...spread}`, the usage counts are a **lower bound** — the index cannot see inside a spread. Say so rather than reporting the numbers as exact. A component whose call sites are mostly spreads has an unenforced contract in practice.

### 6. Naming conformance
Compare the prop names against the repo's vocabulary — `fe-index query --props <name>` shows which other components use the same name. A new component calling it `label` where every sibling calls it `title` costs every future reader a lookup, and the index makes the convention checkable rather than asserted.

### 7. Breaking-change cost
Before proposing any contract change, run `fe-index impact <path>`. That number *is* the cost. A rename affecting 3 call sites is an edit; one affecting 80 across 12 routes is a migration and a `one-way` decision needing human sign-off.

## Designing a new contract

- **Types carry the contract.** Prefer a union to `string`. Prefer a discriminated union where props are only valid together — a `variant="link"` that requires `href` and forbids `onClick` is a type that prevents a whole class of bug documentation only describes.
- **Handlers named for what happened** (`onSelect`, `onDismiss`) age better than handlers named for the mechanism (`onClick`). Payloads carry the domain value, not the DOM event, unless callers genuinely need it.
- **Controlled vs uncontrolled, decided explicitly.** If it takes `value`, does it take `onChange`? What happens when `value` arrives without `onChange` — a silently read-only input is the classic. If both modes are supported, say how it switches, and forbid switching mid-life.
- **Escape hatches are contract expansions.** `className`, `style`, `...rest` to the root, `ref` forwarding, `as`/`asChild`. Forwarding rest to the DOM is convenient and permanently widens the contract to every HTML attribute. Choose it, do not drift into it.
- **Composition over configuration when the prop family grows.** A component sprouting `headerIcon`, `headerBadge`, `headerAction` wants slots or a compound API. Configuration scales to the cases you predicted; composition scales to the ones you did not. Check the repo's existing convention first — a compound component in a prop-bag codebase is inconsistent even when it is better.

## Output shape

```
## Prop analysis — <Component> (<path:line>, N call sites)
| prop | type | required | default | passed at | verdict |
## Dead surface (never passed): <list> — never-adopted | abandoned (blame date)
## Undeclared (passed, not declared): <list> — absorbed by rest | forwarded to DOM | DROPPED
## Boolean cluster: N boolean-ish props — <the nonsensical combination that compiles>
## Optional-but-always-passed: <list> — candidates to make required
## Spread call sites: N — usage counts are a lower bound
## Naming conformance: <prop — repo's convention — match?>
## Breaking-change cost (if proposing one): N call sites, M routes — one-way?
```
