---
name: i18n-rtl
description: Build UI that survives translation and bidirectional text — no concatenated strings, no hardcoded formats, logical CSS properties, and layouts that tolerate 40% longer words. Load when the app is or may become multilingual.
---

# Internationalization and RTL

Retrofitting i18n is one of the most expensive frontend migrations there is. The cheap moves are almost all structural and cost nothing on day one.

## Never build a sentence from parts

```jsx
<>{count} {count === 1 ? 'item' : 'items'} in {folderName}</>   // untranslatable
```
Word order differs between languages, and plural rules are not binary — Arabic has six forms, Polish three, Japanese one. A concatenated sentence cannot be translated correctly by anyone.

Use a full message with named placeholders and proper plural support:
```
"items_in_folder": "{count, plural, one {# item} other {# items}} in {folder}"
```
Every serious i18n library supports ICU message syntax. Use it, including for the "simple" cases — those are the ones that get concatenated.

## Never hardcode a format

Dates, times, numbers, currencies, percentages, lists, and relative times are all locale-dependent, and `Intl` handles all of them:

```js
new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: tz }).format(d)
new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
new Intl.RelativeTimeFormat(locale).format(-3, 'day')
new Intl.ListFormat(locale).format(['a','b','c'])
```

**Always pass an explicit timezone** for anything server-rendered — the server's timezone and the user's differ, and near midnight they differ by a whole day. That is both a correctness bug and a hydration mismatch.

Also: sorting. `Intl.Collator` sorts correctly per locale; a plain `.sort()` on strings does not (and puts `Ä` after `Z`).

## Layout must tolerate length

German and Finnish run 30–40% longer than English; Japanese and Chinese are far shorter. A button sized to fit "Save" will clip "Speichern".

- Never fix a width to the English string.
- Test with the longest realistic translation — or a pseudo-locale that expands strings, which is the cheapest way to find every clipping bug at once.
- Allow wrapping, or truncate with the full value reachable.

## RTL is a mirror, and CSS logical properties do it for you

For Arabic, Hebrew, Persian and Urdu the whole layout mirrors. The mechanical fix is to stop using physical directions:

| physical | logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |

With `dir="rtl"` on `<html>`, logical properties mirror automatically and physical ones do not. This is why a single surviving `margin-left` shows up as one misplaced element in an otherwise-correct RTL layout.

**What does not mirror:** icons that indicate direction *of content flow* mirror (back/forward arrows, indent); icons of real-world objects do not (a clock, a play button, a logo). Media playback controls conventionally do not mirror. Numbers and phone numbers stay left-to-right.

**Test by setting `dir="rtl"` and looking.** Every RTL bug is visible in one screenshot.

## Bidirectional text

Mixed LTR/RTL content (an English product name inside an Arabic sentence, or a URL in either) reorders unexpectedly. Wrap the embedded run in an element with its own `dir`, or use `<bdi>` for user-generated content of unknown direction — a username in the wrong script can otherwise rearrange the punctuation around it.

## Things that are not text but are localized

- **Images containing text** — need a per-locale version, or should not contain text.
- **Currency**: formatting *and* which currency to display are different decisions.
- **Names**: no assumption of first/last order, and no assumption a name is Latin script.
- **Addresses and phone formats** vary structurally, not just in punctuation.
- **Colour and iconography connotations** differ by culture; not a code issue, but a review one.

## Loading translations

- Do not ship every locale's messages to every user — split by locale.
- Decide what shows while messages load: a flash of the message key is worse than a brief empty state.
- Have a fallback locale, and log missing keys rather than rendering the key to the user.

## Checklist

```
## i18n — <feature>
## Concatenated strings (path:line — replaced with a full ICU message?)
## Plural handling (ICU plural forms, not `count === 1`)
## Formatting (date/number/currency/relative/list — via Intl with explicit locale + timezone?)
## Sorting (Intl.Collator where user-visible order matters)
## Length tolerance (longest translation or pseudo-locale — clipping found?)
## Logical properties (any remaining physical directions — path:line)
## RTL screenshot (rendered with dir="rtl" — findings)
## Icon mirroring decisions (which mirror, which do not)
## Bidi isolation for user-generated content
## Message loading (split by locale · loading state · fallback · missing-key handling)
```
