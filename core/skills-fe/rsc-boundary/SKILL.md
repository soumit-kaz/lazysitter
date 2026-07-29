---
name: rsc-boundary
description: Place and audit the Next.js App Router server/client boundary — 'use client' placement, serializable props, server-only modules, caching, streaming. Load for any Next App Router work.
---

# The server/client boundary (Next App Router)

## Confirm the router mode first, always

```bash
lazysitter fe-index stack        # reports app | pages | app+pages mid-migration
```
`app+pages` is **mid-migration**, not a free choice. Which one new code belongs in is a `fact` with a real answer — raise a FACT-BLOCK rather than picking the one you prefer.

## The boundary is a correctness boundary

A **Server Component** runs on the server only. It cannot use `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useRef`, `useContext`, `createContext`, event handlers, or browser APIs. It can be `async`, read the filesystem, query a database, and hold secrets.

A **Client Component** — a file with `'use client'` at the top, or any file imported by one — runs on the server for the initial HTML **and** in the browser. It can do everything React can do, and its code is shipped to the browser.

```bash
lazysitter fe-index signals --rule NEXT
```
catches the mechanical violations: client APIs with no directive, boundaries pushed too high, server-only modules in client files.

## Place the boundary at the narrowest interactive component

The most common Next mistake is `'use client'` at the top of a page or layout. It marks **the entire subtree** as client code — the app is now a client-rendered SPA with extra steps, and the server-rendering benefit is gone for everything below.

The pattern that works: keep the page a Server Component, fetch there, and push `'use client'` down to the leaf that actually needs interactivity.

```jsx
// app/products/page.tsx — Server Component, no directive
export default async function Page() {
  const products = await getProducts();          // runs on the server
  return <ProductList products={products}><AddToCart /></ProductList>;
}
// components/AddToCart.tsx — 'use client', because it needs onClick + useState
```

**Server Components can be passed as `children` to Client Components.** That is the escape hatch that keeps the boundary narrow: a client-side interactive shell wrapping server-rendered content, without the content becoming client code.

## Props crossing the boundary must be serializable

Server → Client props are serialized. **Functions, class instances, `Map`/`Set`, symbols, and (depending on configuration) `Date` do not cross.** A callback passed from a Server Component to a Client Component is a build error at best and a confusing runtime failure at worst.

Pass plain data across, and define the behaviour on the client side of the boundary.

## Server-only modules must never be reachable from a client file

`fs`, `path`, `crypto`, database clients, anything holding a secret. An import chain that pulls one into a `'use client'` file breaks the client build — and if it closes over a secret, the leak precedes the break. Use the `server-only` package to make the violation a clear error at the import rather than a mystery at bundle time.

Note the inverse: `client-only` marks a module that must never be pulled into a Server Component.

## Caching is where the surprises are

For each fetch, decide and state which of these it is:
- **static** — fetched at build, cached indefinitely;
- **revalidate: n** — regenerated at most every n seconds;
- **tag-based** — revalidated explicitly by `revalidateTag` after a mutation;
- **dynamic** — never cached, fetched per request.

A wrongly-cached fetch shows one user another's data, or a stale list after a mutation — and both are **invisible in development**, where caching behaves differently. This is the single highest-value thing to state explicitly per fetch.

Also note: reading cookies or headers opts a route into dynamic rendering, which is often correct and often surprising.

## Streaming and suspense boundaries

`loading.tsx` and `<Suspense>` decide what the user sees while data loads. Too high and nothing streams usefully — the whole page waits. Too low and the page fragments into a dozen independent spinners that shift as they resolve.

Rule of thumb: a boundary around each **independently useful** region. The nav and page shell should render immediately; a slow data table can stream in behind a skeleton with its final dimensions.

## Error boundaries per segment

`error.tsx` per route segment catches render errors below it. **A segment with no error boundary turns any thrown error into a blank page.** Check coverage for every route the feature touches — this is cheap to add and catastrophic to omit.

Note `error.tsx` must itself be a Client Component, and `global-error.tsx` handles failures in the root layout.

## Server Actions

If the feature uses them: they are POST endpoints with a friendly syntax. **Authorization must be checked inside the action** — being defined in a server file is not access control, since the action is callable by anyone who can reach the route. Validate the input inside the action too; the client-side form validation is UX.

## Auditing checklist

```
## RSC audit — <feature>
## Router mode (confirmed, evidence)
## Boundary map (file — server|client — narrowest needed? — why)
## Client subtrees created (what became client code that need not have)
## Serializability (prop — crosses boundary? — serializable?)
## Server-only reachability (module — reachable from a client file?)
## Caching per fetch (static | revalidate n | tag | dynamic — and why)
## Suspense/loading boundaries (segment — boundary — what streams)
## Error boundary coverage (segment — error.tsx present? — GAPS)
## Server Actions (authorization checked inside? — input validated inside?)
## Hydration determinism (see the hydration-safety skill)
```
