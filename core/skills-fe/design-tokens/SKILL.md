---
name: design-tokens
description: Work within the design system actually in force — find the token source, use the scales, detect violations, and handle theming. Load before writing any styles or choosing any visual value.
---

# Design tokens and the real design system

Every repo has a **documented** design system and a **real** one. New code that follows the documented one while the surrounding forty files follow the real one produces a feature that looks subtly wrong and reviews as correct.

## Find the source of truth

```bash
lazysitter fe-index stack                        # what recon detected
lazysitter fe-index signals --rule STYLE         # where the repo already violates it
```

Token sources, in the order they usually appear: CSS custom properties (a `:root` block or a theme file) · a Tailwind theme config · a vanilla-extract/Stitches/Panda theme · a TS constants file.

**Two sources is a migration signal.** Which is canonical for new code is a `fact` question with a real answer — raise a FACT-BLOCK rather than picking one. Guessing here splits the design system further.

## Read every scale, not just the palette

The ones nobody documents are where new code most often invents a value:

| scale | why it matters |
|---|---|
| **colour** | theming and dark mode depend entirely on it |
| **spacing** | an off-scale gap is instantly visible next to on-scale siblings |
| **radius** | mismatched corners read as a different component library |
| **shadow / elevation** | ad-hoc shadows destroy the depth hierarchy |
| **z-index** | the least documented and the most fought over |
| **typography** | size, weight, line-height, and the relationships between them |
| **breakpoints** | a one-off media query diverges from every other component |
| **motion** | duration and easing consistency is most of what makes an app feel coherent |

## Measure the violation rate before enforcing

```bash
lazysitter fe-index signals --rule STYLE-HARDCODED-COLOR,STYLE-ARBITRARY-VALUE,STYLE-IMPORTANT
```

A feature area with a high violation rate is telling you something: **the tokens are not usable for these cases.** That is a finding for the architect, not a rule to enforce harder. New code will drift the same way and for the same reason unless the plan says what is different.

Note that the token-defining file itself will show as violations — that is where the literals legitimately live.

## Using tokens correctly

- **Semantic over primitive.** `--color-danger` beats `--red-600` at the point of use: the semantic token can be re-pointed for a theme, and it says why the colour was chosen.
- **Every colour must resolve in every theme.** A token with only a light value is invisible in the default theme and obviously broken in dark mode. Check both.
- **A CSS variable referenced but never defined resolves to nothing** — silently transparent or inherited, with no error. Confirm each token you use is actually defined.
- **Off-scale values need a stated reason.** Sometimes there is one (matching a third-party embed, an optical adjustment). Say it in the code, so the next reader does not "fix" it or copy it.

## z-index needs a scale, not a number

`z-index: 9999` is a promise to lose a fight later with a modal, a tooltip, or a sticky header. Define layers (`base`, `dropdown`, `sticky`, `overlay`, `modal`, `popover`, `toast`) and use them. If the repo has no scale and the feature stacks things, raise it — this is cheap to introduce and expensive to retrofit after three features have each picked their own numbers.

Related: a `z-index` only competes within its **stacking context**. A parent with `transform`, `filter`, `opacity < 1`, or `will-change` creates one, and a child's `z-index: 9999` cannot escape it. This is the usual explanation for "my modal is behind the header despite a huge z-index".

## `!important` and specificity

`!important` opts out of the cascade and forces the next override to escalate too. Get specificity from structure instead — a scoped class, a data attribute, or a cascade layer (`@layer`), which is designed exactly for this and makes the precedence explicit.

The legitimate exceptions are narrow: overriding a third-party stylesheet you do not control, and utility classes that are meant to win by design.

## Design-tool cross-check

If a Figma MCP server is connected and the request references a design file, pull the variable definitions and compare the token **names** against the repo's. A mismatch is a real finding: it is the point at which "matches the design" stops being checkable, and every future handoff pays for it.

## Checklist

```
## Tokens — <feature>
## Source of truth (file, count, kind) — or MULTIPLE → FACT-BLOCK
## Scales available (colour/spacing/radius/shadow/z-index/type/breakpoints/motion)
## Values used (declared value → token name → defining path:line)
## Off-scale values (value — stated reason)
## Theme coverage (token — light — dark — both defined?)
## Undefined-token references (token — used at path:line — defined? NO)
## Violation rate in this area (count — what it implies about token usability)
## z-index layers used (from the scale) + stacking-context check
## Figma token-name cross-check (if consulted)
```
