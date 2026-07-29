---
name: image-media
description: Ship images and media correctly — dimensions, formats, responsive sources, lazy-loading, priority, and accessible alternatives. Load when a feature renders images, video, icons, or embeds.
---

# Images and media

Images are usually the largest bytes on a page, the most common cause of layout shift, and the most common accessibility gap. All three are fixable with attributes.

## Always set dimensions

`width` and `height` attributes (or an `aspect-ratio` in CSS) let the browser reserve the box before the file arrives. Without them, the layout jumps when it loads — this is the single most common CLS cause, and it costs one attribute pair to avoid.

The attributes set the *intrinsic ratio*; CSS still controls the rendered size. `width={800} height={600}` plus `style={{ width: '100%', height: 'auto' }}` gives a fluid image with a reserved box.

## `alt` is a decision, not a formality

- **Meaningful image** → describe **the information it conveys in context**, not the picture. A product photo in a listing is the product name; the same photo on the product page, where the name is already a heading, may be decorative.
- **Decorative image** → `alt=""` (empty, present). Omitting `alt` entirely makes some screen readers announce the filename, which is worse than silence.
- **Image inside a link or button** → the alt text carries the link's accessible name. `alt=""` on the only content of a link produces an unnamed link.
- **Image of text** → the alt must contain the text verbatim. Better: do not ship text as an image.
- **Complex image** (a chart, a diagram) → a short `alt` plus a longer description nearby or linked. A chart's alt should carry the *finding*, not "bar chart".

## Format and compression

- **AVIF** and **WebP** are meaningfully smaller than JPEG/PNG at equivalent quality. Serve them with a fallback via `<picture>`, or let the framework negotiate.
- **SVG** for icons, logos, and line art — resolution-independent and tiny. Sanitize any user-supplied SVG; it can carry script.
- **Do not ship a 3000px image** to display at 400px. Resize at build or via an image service.

## Responsive sources

```html
<img src="hero-800.jpg"
     srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w"
     sizes="(max-width: 600px) 100vw, 50vw"
     width="800" height="600" alt="…">
```
`sizes` tells the browser how large the image will be **before** layout, so it can choose the right source. Getting it wrong means downloading a source far larger than needed — the usual symptom of "we added srcset and nothing improved".

## Lazy-loading and priority

- **`loading="lazy"`** for everything below the fold.
- **Never lazy-load the LCP image.** It is a self-inflicted LCP regression and it is common. Mark it `fetchpriority="high"` instead, and consider preloading it.
- **`decoding="async"`** keeps decode off the main thread.

The rule of thumb: images above the fold are eager and prioritized; everything else is lazy.

## In a Next.js app, use `next/image`

It handles sizing, format negotiation, responsive sources, and lazy-loading. Two things still need deciding:
- **`priority`** on the LCP image (it disables lazy-loading and preloads);
- **`sizes`** whenever you use `fill` or a responsive layout — omitting it makes the browser assume `100vw` and download far too much.

```bash
lazysitter fe-index signals --rule NEXT-RAW-IMG
```
finds raw `<img>` tags in a Next app.

## Video

- **Never autoplay with sound.** Autoplay muted is permitted and still costs bandwidth — prefer a poster image with an explicit play control.
- **`poster`** reserves the space and gives something to look at.
- **Captions are required** for meaningful audio, and a transcript is better still.
- **`preload="none"` or `"metadata"`** for anything not immediately played.
- Respect `prefers-reduced-motion` for anything that plays automatically, including animated GIFs and autoplaying background video.

## Icons

- **Inline SVG** for icons that need to inherit colour or be animated.
- **Icon fonts** are a legacy approach with real accessibility problems (they read as glyphs when the font fails).
- **Never import a whole icon set for three icons** — see `bundle-budget`.
- An icon-only button needs an accessible name (`aria-label`), and the SVG itself should be `aria-hidden="true"` so it is not announced twice.

## Third-party embeds

Maps, videos, social widgets: each is a script running in your origin with full DOM access, plus significant weight. Facade-first — render a lightweight placeholder and load the real embed on interaction. It is usually the largest single performance win available on a content page.

## Checklist

```
## Media — <feature>
## Per image: dimensions set? · alt (meaningful|empty+why) · format · srcset+sizes · lazy|priority
## LCP image identified — and NOT lazy-loaded
## Oversized sources (delivered px vs displayed px)
## Video (autoplay? · poster · captions · preload · reduced-motion)
## Icons (inline SVG? · accessible name on icon-only buttons · aria-hidden on the glyph)
## Third-party embeds (facade-first? · weight · what it can access)
## CLS check (every media element's space reserved)
```
