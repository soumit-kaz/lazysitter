---
name: client-security
description: Client-side security for React apps — XSS sinks, secrets in the bundle, token storage, CSP, redirects, postMessage, and the limits of client-side enforcement. Load when handling untrusted data, credentials, or third-party code.
---

# Client-side security

Two questions cover most of it:
1. **What did we ship to the browser that we should not have?**
2. **What will we render that we do not control?**

## Everything in the bundle is public

There is no such thing as a secret in client code. Minification is not obfuscation, and source maps are often shipped.

**Build-time public prefixes are the trap**: `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `PUBLIC_`, `EXPO_PUBLIC_`, `GATSBY_`. A value behind one of these is **inlined into the JavaScript as a string literal** — it is not an environment variable at runtime, it is published.

```bash
lazysitter fe-index signals --rule SEC-PUBLIC-ENV-SECRET
```

Some keys are *designed* to be public — a Stripe publishable key, a Supabase anon key, a public analytics id. Say which is which, and why, rather than flagging everything or nothing.

## XSS: React escapes by default, and here is where it does not

React escaping text is why XSS is rare in React apps — and why the exceptions matter so much.

**`dangerouslySetInnerHTML`** — the main sink. Every use needs a real sanitizer (DOMPurify or equivalent) with a stated allow-list, and a reason the content cannot be rendered as text. Sanitize on **output**, not only on input — data can enter through a path you did not sanitize.

**`href` / `src` from a variable** — a `javascript:` or `data:text/html` URL is script execution:
```jsx
<a href={user.website}>          // user.website = "javascript:fetch('/api/keys')..."
```
Validate the **scheme against an allow-list** (`https:`, `http:`, `mailto:`, relative). Blocklisting fails to encodings and casing.

**User-supplied SVG** can contain `<script>` and event handlers. Sanitize it or render it as an `<img>`, which does not execute script.

**Markdown → HTML** is an XSS sink unless the renderer is configured to disallow raw HTML.

**Third-party rich-text and CMS content** is untrusted, whatever the CMS's reputation.

## Where credentials live

- **`localStorage`/`sessionStorage`** are readable by **any script on the origin**, including a compromised dependency. A token there is one supply-chain incident away from exfiltration.
- **An `httpOnly`, `Secure`, `SameSite` cookie** is not readable by JavaScript. It is the better default for session credentials, and the trade-off is that you must handle CSRF.
- **In-memory only** (a variable, not persisted) is strongest and costs a re-authentication on refresh.

This is a frontend decision with backend consequences — decide it explicitly and record it.

```bash
lazysitter fe-index signals --rule SEC-TOKEN-IN-STORAGE
```

## The UI is not an enforcement point

Hiding a button is a usability improvement. **The server must enforce every permission the UI reflects.** If that is unknown for a new capability, it is a `BACKEND-DEPENDENCY` to raise, not an assumption to make.

Corollary: never send data to the client that the user is not allowed to see, then hide it in the UI. It is in the network response.

## CSP

A Content-Security-Policy is the strongest single mitigation for XSS. If the repo has one, check whether the feature needs an inline script, an inline style, or an `eval`-based library — each is either a policy weakening or a design change, and knowing now is far cheaper than at deploy.

Prefer nonce- or hash-based policies over `unsafe-inline`. `unsafe-eval` should be a last resort; several older libraries need it, which is a reason to prefer newer ones.

## Redirects and `postMessage`

- **Open redirect**: a `?next=` parameter used as a destination without validation sends users to an attacker's site with your origin's credibility. Validate against an allow-list of paths, and never accept an absolute URL.
- **`postMessage`**: **always check `event.origin`** against an expected value before trusting a message, and always specify a target origin when posting (never `'*'` with sensitive data). A handler with no origin check accepts messages from any embedding page.

## `target="_blank"`

Add `rel="noopener"` (modern browsers default to it, but be explicit). Without it the opened page can navigate yours via `window.opener`.

## Third-party scripts

Every third-party script runs in your origin with full DOM and storage access. Analytics, chat widgets, tag managers, A/B tools — each is a supply-chain dependency with production access.

- Prefer loading them in a sandboxed iframe or via a facade.
- Use Subresource Integrity for anything from a CDN.
- Ask what data leaves — check that error reporters and analytics do not capture form values, tokens in URLs, or PII in breadcrumbs. Error reporters capturing an authenticated URL with a token in the query string is a common real leak.

## Uploads and downloads

Client-side type and size checks are UX, not security — the server must validate. For generated downloads, never reflect unsanitized user content into an HTML file (a downloaded HTML file opens with file-origin privileges), and never let a filename be attacker-controlled.

## Checklist

```
## Client security — <feature>
## Public-prefix env values (name — secret-shaped? — designed-public? — verdict)
## XSS sinks (sink — untrusted source — sanitizer + allow-list — path:line)
## URL/scheme validation (dynamic href/src — allow-list applied?)
## Credential storage (what — where — why — CSRF handled if cookie)
## Client-side gating (what — server enforcement confirmed? — or BACKEND-DEPENDENCY)
## CSP impact (inline script/style/eval needed? — policy change?)
## Redirects (parameter — validated against an allow-list?)
## postMessage (origin checked on receive? — explicit target on send?)
## Third-party scripts added (what it can access — what data leaves — SRI?)
## Uploads/downloads (server validation confirmed · generated-file safety)
```
