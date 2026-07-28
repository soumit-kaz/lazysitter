# Deferred scope — user instructions received mid-run, NOT implemented

Recorded because the closing-loop-auditor found these had been silently dropped, and PLAN.md
wrongly claimed "Open items: None blocking". Deferral is the right engineering call; not writing
it down was drift.

1. **New criticism sets** — `critisisms/fromEvv/` (705 lines) and `critisisms/fromP1stonFrontEnd/`
   (2,217 lines across 7 files). NOT read, NOT adjudicated. `docs/CRITICISM-RESPONSE.md` covers
   only fromP1stonDestopWidget + fromP1stonProject.
2. **Loop engineering** — "worlds best, most accurate but fastest and cheapest loop engineering."
   NOT designed, NOT implemented. Constraint recorded: **never use Fable** (no Fable model in any
   roster tier, any adapter, or any recommendation).
3. **Frontend teams** — dedicated React, Angular, and Next.js teams. Requirements captured:
   - MCP connectivity (e.g. shadcn) must be supported.
   - **Existing-component reuse is critical and currently fails.** In a 10-year-old UI codebase all
     needed components already exist; LazySitter does not find them reliably. Any new frontend work
     MUST use existing components.
   - Per-project frontend conventions (e.g. where a loader spins) must be **discovered lazily —
     only when needed, not upfront — and cached permanently** so later runs never re-derive them.
4. **AWS team** — multiple world-class AWS experts. Requirements captured:
   - Decide whether a new Lambda / new AWS service is actually needed.
   - **Strong default: do not introduce a service the project does not already use** — suggest only.
   - Cost and memory efficiency, without compromising accuracy.
5. **Global priority ordering** — accuracy > time > memory; sometimes accuracy > memory > time.
   File-handling work specifically requires FAANG-class engineering; no junior-grade expert may
   advise on it.

Items 3 and 4 are roster changes and must be adjudicated against R2 in `docs/CRITICISM-RESPONSE.md`,
which rejected roster growth. That rejection was made on evidence from two backend repos; the
frontend evidence (fromP1stonFrontEnd) has not been read and may overturn it. Do not treat R2 as
settled for the frontend case until that review is adjudicated.
