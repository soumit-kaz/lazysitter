---
name: state-topology
description: Decide where each piece of state lives — server, URL, client, session — and detect the misclassifications that cause most "wrong data on screen" bugs. Load before designing state for a feature, or when auditing an existing state layer.
---

# State topology

Most bad state designs are a **misclassification**, not a bad library choice. Classify first; place second.

## The four kinds

| kind | owned by | lives in | the failure when misplaced |
|---|---|---|---|
| **server state** | the backend | the server-state cache (react-query/SWR/Apollo) | copied into `useState` → goes stale, and nothing tells you |
| **URL state** | the URL | search params / route segments | unlinkable, unshareable, back button does the wrong thing |
| **client state** | this UI | the nearest common consumer | lifted too high → re-renders everything; too low → drilled |
| **session state** | the session | one well-known store | duplicated → theme/locale disagree between screens |

## The single biggest bug source: server state copied into client state

```jsx
const { data } = useQuery(['user', id], fetchUser);
const [user, setUser] = useState(data);        // ← a second copy nothing keeps in sync
```
Once copied, the cache can update and the copy will not. Every "it shows the old value until I refresh" bug traces back here.

Legitimate reasons to copy exist — an editable draft of a fetched entity is the main one. When you do, say explicitly **what reconciles them**: when the draft resets, what happens if the server value changes mid-edit, and whether the user is told.

## URL state — decide it early, it is expensive to retrofit

Belongs in the URL: filters, search terms, sort, pagination, selected tab, selected entity id, and often whether a modal is open. The test: **would a user reasonably expect to bookmark or share this view, or to get back to it with the back button?**

Belongs in memory: transient interaction state — hover, focus, an open dropdown, a drag in progress, an unsubmitted form's keystrokes.

Getting this wrong is one of the most-complained-about frontend defects, and it is nearly free to get right on day one.

## Colocate, then lift only to the nearest common consumer

Start state in the component that uses it. Lift only when a second component genuinely needs it, and only to their nearest common ancestor. Reaching for a global store for state one subtree needs is the same over-reach class as a duplicate component.

**Measure the drilling rather than guessing:**
```bash
lazysitter fe-index drill
```
Every prop passed unchanged through 3+ components, with the full path and every `path:line`. A depth-5 chain is a real signal; a depth-3 chain often is not. Use what the repo already tolerates as the calibration.

## Context: the right size, and the stability trap

Context solves drilling, and it fans re-renders out to every consumer. Two rules:
1. **Memoize the value, or split the context.** A provider passing `value={{ state, actions }}` re-renders every consumer on every provider render. Splitting into a rarely-changing state context and a stable actions context means components that only dispatch never re-render on state changes.
2. **Scope it to the subtree that needs it**, not the app root. A context at the root is a global store with worse ergonomics.

## Derived state is not state

If it can be computed from existing state during render, compute it. An effect that syncs derived state doubles renders and creates a frame where the two disagree. The signal: a `useState` whose only writer is a `useEffect` watching other state. Expensive derivation is a `useMemo` — still not state.

## Persistence

If anything is persisted (localStorage, IndexedDB, cookies), decide four things up front:
- **the key**, namespaced and versioned;
- **the schema version**, stored alongside;
- **the stale-read path** — what happens when a value written by an older version of the app is read back. Silently trusting it is how a crash-on-load ships to exactly the users who have been around longest;
- **what must never be persisted** — anything credential-shaped. Web storage is readable by any script on the origin.

Note the rollback consequence: **reverting code does not revert persisted data.** Users carry the new shape into the reverted app. If a feature changes a persisted shape, that is a reversibility fact for the one-way-doors inventory.

## Multi-tab and concurrency

Two tabs of the same app share storage and cookies but not memory. If the feature persists anything or assumes single-session ownership, decide: ignore it, sync via the `storage` event or a `BroadcastChannel`, or detect and warn. "Ignore it" is a legitimate choice — silently doing the wrong thing is not.

## Reporting

```
## State topology — <feature>
| piece | kind (server/url/client/session) | placement | why |
## Server-state copies (path:line — what reconciles them)
## URL-state decisions (what is in the URL, what is not — shareability consequence)
## Drill chains found (depth, prop, path — from fe-index drill)
## Context design (scope — value stability: memoized | split | UNSTABLE)
## Derived-state-in-useState instances (path:line — what it should be)
## Persistence (key — version — stale-read path — rollback consequence)
## Multi-tab decision
```
