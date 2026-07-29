---
name: component-api-design
description: Design a component's public API — composition vs configuration, slots, polymorphism, controlled/uncontrolled, variant unions, escape hatches. Load when creating a reusable component or extending one others consume.
---

# Component API design

`prop-analyzer` measures an existing API. This skill decides a new one. The governing fact: **once twenty files call it, changing it is a migration**, so this is the highest-leverage design decision in a frontend feature.

## First, check what the repo already does

```bash
lazysitter fe-index precedent "<category>" --kind component
lazysitter fe-index props <SiblingComponent>
```
A compound component in a prop-bag codebase is inconsistent even when it is better. Match the repo's axis unless you have a reason to change it — and a reason to change one component's axis is usually a reason to change the convention, which is a bigger conversation.

## Configuration vs composition

**Configuration** — the component takes props describing what to render:
```jsx
<Card title="X" subtitle="Y" headerIcon={<Icon/>} headerAction={<Button/>} footer={<Links/>} />
```
Scales to the cases you predicted. When a prop family grows a fourth member (`headerIcon`, `headerBadge`, `headerAction`, `headerMenu`), it is telling you it has outgrown the axis.

**Composition** — the component provides structure, the caller provides content:
```jsx
<Card>
  <Card.Header><Icon/><Card.Title>X</Card.Title><Button/></Card.Header>
  <Card.Body>…</Card.Body>
</Card>
```
Scales to the cases you did not predict, at the cost of more API surface to learn and weaker constraints on what callers can put where.

**Choose configuration** for a small, closed set of variations where you want to *prevent* arbitrary content. **Choose composition** when callers keep needing arrangements you did not foresee. The growing-prop-family signal is reliable: three variations is configuration, six is composition.

## Variant unions over boolean flags

```jsx
<Button primary danger large />          // 8 combinations, 5 meaningless, 0 prevented
<Button variant="danger" size="lg" />    // exactly the supported set
```
When flags are mutually exclusive they are a union. When they are independent but interact, a discriminated union makes invalid combinations unrepresentable:

```ts
type ButtonProps =
  | { as: 'button'; onClick: () => void; href?: never }
  | { as: 'a'; href: string; onClick?: never };
```
The test: **can you name a prop combination that compiles and makes no sense?** If yes, the type is not carrying the contract.

## Controlled, uncontrolled, or both — decide explicitly

- **Controlled** (`value` + `onChange`): the parent owns the state. Predictable, and the right default for anything the parent needs to read.
- **Uncontrolled** (`defaultValue`): the component owns it. Less parent code for simple cases.
- **Both**: support them, but decide what `value` without `onChange` means — a silently read-only input is the classic trap. Either make it genuinely read-only and say so, or make `onChange` required alongside `value` in the type.
- **Never let a component switch modes mid-life.** Fix the mode at mount from whether `value` was passed.

## Polymorphism, if you need it

`as`/`asChild` lets one component render as different elements — a Button that is sometimes an `<a>`. It is genuinely useful for semantics (a link should be an anchor, for keyboard and for right-click) and it costs real type complexity. Add it when the semantic need is real, not for flexibility in the abstract.

## Escape hatches are permanent contract expansions

- **`className`** — nearly always worth supporting; merge, do not overwrite.
- **`style`** — supporting it invites bypassing the design system; consider omitting it deliberately.
- **`...rest` forwarded to the root DOM node** — convenient, and it permanently widens your contract to *every* HTML attribute, including ones that will collide with props you add later. Choose it consciously.
- **`ref` forwarding** — support it for anything a parent may need to focus, measure, or scroll. Focus management usually requires it, so for interactive components this is close to mandatory.

## Handler naming and payloads

Name for **what happened**, not the mechanism: `onSelect` over `onClick`, `onDismiss` over `onCloseButtonClick`. A handler named for the mechanism constrains the implementation forever — the day the component also closes on `Escape`, `onCloseButtonClick` is a lie.

Payloads carry the domain value (`onSelect(item)`), not the DOM event, unless callers genuinely need the event. Match the repo's existing convention; consistency beats correctness here.

## Required vs optional

Prefer **few required props that fully determine the render** over many optional ones that interact. Every optional prop with a default multiplies the states the component can be in and that tests must cover.

A useful check after the fact: an optional prop passed at *every* call site is a required prop in disguise, and its default is dead code.

## Accessibility is part of the API

- If the component renders an interactive element, does its API let the caller give it an accessible name? An icon-only button with no `aria-label` prop cannot be made accessible by its caller.
- If it opens something, does the API let the caller control focus return?
- If it renders a list, does it expose the semantics (`role`, keyboard model) or leave the caller to bolt them on?

An API that makes the accessible usage harder than the inaccessible one will produce inaccessible usage.

## Document the contract in types, not comments

Prefer a union to `string`. Prefer `ReactNode` to `string` for anything that might contain markup. Make the invalid states unrepresentable, and the documentation becomes a description of the type rather than a warning about it.
