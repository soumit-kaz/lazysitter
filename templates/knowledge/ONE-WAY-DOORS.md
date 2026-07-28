# LazySitter — One-Way-Door Inventory (committed knowledge)

Tracks decisions that are expensive or impossible to reverse once shipped: schema migrations that
drop or reshape data, public API contracts, billing/ledger writes, irreversible external side
effects. `lazysitter-architect` consults and extends this file when assessing reversibility as part
of the fixed non-functional checklist. `lazysitter-rollback-agent`'s standing revert authority is
void unless the change under rollback was established as reversible here.

Cite a Jira issue by **key only** (e.g. `PROJ-123`) — never quoted ticket text.

## Format

```
<decision/surface> — reversible: yes|no|conditional — <path:line or command evidence> —
  <condition, if conditional> — first-recorded: <sha> — last-verified: <sha>
```

---

## Inventory

(none recorded yet)
