---
name: hydration-safety
description: Find and fix hydration mismatches in server-rendered React — non-deterministic render values, browser-only APIs, locale and timezone divergence, invalid HTML nesting. Load for any SSR/Next work, and when debugging "works in dev, breaks in prod".
---

# Hydration safety

## What a mismatch actually costs

The server renders HTML; the client renders the same tree and attaches to it. If the two disagree, React discards the server HTML for that subtree and re-renders on the client. That means: **lost server-rendering benefit, a visible flash, effects firing again, and any state initialized from the server markup going wrong.** It is not a cosmetic warning.

Worse, mismatches are frequently **invisible in development** — same machine, same timezone, same locale, same clock — and appear only in production across real users.

```bash
lazysitter fe-index signals --rule HYDRATE-NONDETERMINISTIC
```
finds the mechanical candidates. They are heuristic — confirm each by reading.

## The five causes, in order of frequency

### 1. Time and randomness in render
`Date.now()`, `new Date()`, `Math.random()`, a generated id. The server evaluates at request time, the client milliseconds later, and the values differ.

Fixes: compute on the server and pass the value down as a prop · compute in an effect after mount (accepting a first paint without it) · use React's `useId` for generated ids, which is built to be stable across the boundary.

### 2. Browser-only APIs during render
`window`, `document`, `localStorage`, `navigator`, `matchMedia`. On the server they are undefined; guarding with `typeof window !== 'undefined'` **inside render** does not fix the mismatch — it *guarantees* one, because the two environments then take different branches and produce different markup.

The correct shape: render the server-safe version, then update in an effect after mount.
```jsx
const [isWide, setIsWide] = useState(false);           // server-safe default
useEffect(() => setIsWide(window.innerWidth > 1024), []);
```
Accept that the first paint shows the default. If that flash is unacceptable, the value belongs in a cookie the server can read, not in a client-only measurement.

### 3. Locale, timezone and formatting divergence
`toLocaleDateString()` on a server in UTC and a browser in Asia/Dhaka produce different strings — and can differ by a whole day near midnight. Same for number formatting with a different default locale, and for relative times ("2 hours ago").

Fixes: format on the server and pass the string · pass an explicit locale and timezone to `Intl` so both sides agree · or render relative times after mount.

### 4. Invalid HTML nesting
The browser's parser *repairs* invalid HTML before React sees it, so the client tree does not match the server string. A `<div>` inside a `<p>`, a `<p>` inside a `<p>`, a `<tr>` outside a `<tbody>`, a block element inside a `<button>`, or anything other than `<li>` directly inside `<ul>`.

The mismatch appears at a node you did not touch, which makes this one disproportionately hard to diagnose. When a hydration error points somewhere that looks fine, check the nesting above it.

### 5. Content that legitimately differs
Personalization, A/B variants, feature flags evaluated per user, an auth-dependent UI. These genuinely differ if the server does not know what the client knows.

Fix by making the server know — read the cookie/header on the server so both sides render the same thing. Where that is impossible, render the neutral version and swap after mount, deliberately.

## `suppressHydrationWarning` is not a fix

It silences the warning for one element's text content. It does not make the values agree. Legitimate uses are narrow — a timestamp you knowingly render differently, for instance. Anywhere else it hides a real divergence, and the underlying re-render still happens.

## Third-party scripts that mutate the DOM

Browser extensions, analytics, and font loaders that inject attributes into `<body>` or `<html>` cause mismatches nobody in the codebase wrote. This is the usual explanation for a mismatch on the root element that no code accounts for — worth checking before hunting further.

## Auditing checklist

```
## Hydration audit — <feature>
## Non-deterministic values in render (path:line — value — how it is deferred)
## Browser API access during render (path:line — server-safe default + effect?)
## Locale/timezone-dependent formatting (path:line — explicit locale+tz? — or server-formatted?)
## HTML nesting validity (any invalid nesting in the diff)
## Legitimately-divergent content (what — how the server is made to know)
## suppressHydrationWarning uses (path:line — justified?)
## Verification (did you actually load the page and check the console? — with what locale/timezone)
```

**Verify by loading the page**, not by reading the JSX. Check the console for hydration errors, and check with a **non-UTC timezone and a non-default locale** — that is the configuration that exposes category 3, and it is the one nobody tests on.
