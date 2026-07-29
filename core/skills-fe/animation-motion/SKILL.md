---
name: animation-motion
description: Add motion that is smooth, accessible and purposeful — compositor-friendly properties, reduced-motion, interruptible transitions, and what to animate at all. Load when a feature adds transitions, animations, or gesture-driven movement.
---

# Animation and motion

## Motion must do a job

Good motion explains a change: where something came from, that a list reordered rather than replaced, that an action was received. Motion added for polish costs frame budget and user attention, and it is the first thing that feels broken on a slow device.

State the job before implementing: *"the drawer slides from the right so the user knows where it will return to."* If there is no such sentence, consider not animating.

## Animate the cheap properties

Only two categories are handled by the compositor without recalculating layout or repainting:
- **`transform`** — `translate`, `scale`, `rotate`
- **`opacity`**

Everything else is expensive. Animating `width`, `height`, `top`, `left`, `margin` or `padding` triggers **layout on every frame** for the element and often its siblings — this is the single most common cause of janky UI animation.

| instead of | animate |
|---|---|
| `left` / `top` | `transform: translate()` |
| `width` / `height` | `transform: scale()` (with care for text) |
| `margin` | `transform: translate()` |
| `display: none` ↔ `block` | `opacity` + `visibility`, or `@starting-style` |

For size changes where `scale` distorts content, the FLIP technique (measure First and Last positions, apply an Inverted transform, then Play it out) gives a layout-accurate animation using only transforms.

`will-change` promotes an element to its own layer — use it sparingly and remove it after. Applied broadly it costs memory and can make things slower.

## `prefers-reduced-motion` is not optional

Vestibular disorders make large motion genuinely nauseating. This is an accessibility requirement, not a preference toggle.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
That global rule is a good baseline. Better, per-animation, is to **reduce rather than remove**: replace a large slide with a short fade. The user still gets the "something changed" signal without the movement. Removing all feedback can leave a change unnoticed entirely.

Read the preference in JS with `matchMedia('(prefers-reduced-motion: reduce)')` for JS-driven animation, and **listen for changes** — users toggle it mid-session.

## Duration and easing

- **Small UI feedback** (hover, focus, button press): 100–150ms.
- **Medium transitions** (dropdown, tooltip, accordion): 200–300ms.
- **Large transitions** (page, modal, drawer): 300–400ms.
- **Over ~500ms** feels slow, however pretty it is.

Easing: **ease-out** for things entering (fast start, gentle settle — feels responsive), **ease-in** for things leaving, **ease-in-out** for things moving between two on-screen positions. Linear only for continuous motion like a spinner.

Take durations and easings from the design token scale, not per-component values — consistency in motion is most of what makes an app feel coherent.

## Interruption

A user who clicks twice quickly must not wait for the first animation. Animations must be **interruptible**: a spring or a tweened value that continues from its current position, not one that snaps to the start or queues.

This is where CSS transitions do well by default (they interpolate from the current computed value) and where naive JS keyframe animations do badly.

## Do not block interaction

Never make the user wait for an animation to finish before they can act. The element should be interactive as soon as it is visible and positioned. A 400ms modal entrance that swallows clicks for 400ms is a worse experience than no animation.

## Animation and accessibility

- **Nothing auto-plays, auto-advances or auto-scrolls without a control** — a carousel needs pause.
- Content that flashes more than three times per second is a **seizure risk** — never do it.
- **Focus must not be lost** to an animating element; if focus moves as part of the transition, move it deliberately at the end.
- **Announce the outcome**, not the motion. A screen-reader user learns nothing from a slide; they need the live-region message.

## Measure it

Record the interaction in DevTools Performance and look for frames over 16ms. The green "Rendering"/"Painting" bars during an animation mean you are animating an expensive property — that is the diagnosis, not a guess.

Test on a throttled CPU (4–6×). Animation is where the gap between a developer machine and a real device is widest.

## Checklist

```
## Motion — <feature>
## Purpose (what each animation communicates)
## Properties animated (transform/opacity only? — any layout-triggering property)
## Durations & easings (from the token scale?)
## prefers-reduced-motion (reduced or removed? — JS listener for mid-session change?)
## Interruptibility (double-click / rapid toggle behaviour)
## Interaction blocking (is anything unclickable during the animation?)
## Auto-playing content (control provided?) · flash rate
## Focus handling across the transition
## Announcement of the outcome (live region, not the motion)
## Measured (frames over 16ms? — on throttled CPU)
```
