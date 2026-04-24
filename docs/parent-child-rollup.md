# Parent/Child Client Rollup — Enterprise View

**Status:** Planned (2026-04-24). Schema and tab surface exist; rollup
aggregations not yet built.

Surfaces rolled-up views across a parent client and its child locations
so the vCIO can present BOTH an **enterprise-level view** (to exec teams
at the parent) AND **location-specific views** (to location managers).

---

## Current State

As of 2026-04-23 (commit `38a48fc`):
- `clients.parent_client_id uuid → clients.id` exists
- 7 child clients already exist in DB referencing parent clients
- A **Locations** tab exists on parent-client Detail page listing children

What's missing is the aggregated rollup data. Right now the Locations
tab only lists children — it doesn't roll up their assets, initiatives,
goals, recommendations, activities, etc. into a combined view.

## Use Case

Jason's use case (2026-04-24):

> "When meeting with executive team they can see a more enterprise view,
> but then when maybe meeting with location-specific managers we can
> see the location-specific goals / activities / assets / recommendations
> / initiatives / plans etc."

Two operating modes:
1. **Enterprise mode** — parent client Dashboard shows data rolled up
   across ALL child locations (plus parent's own data if any)
2. **Location mode** — child client Dashboard shows only that location's
   data (current behavior, unchanged)

## What to Roll Up

For each of these, the parent Dashboard (Overview tab + sub-tabs) should
show combined data across all children:

| Data type | Source table(s) | Aggregation |
|---|---|---|
| **Assets** | `assets` (Hardware, SaaS, Software) | Union; dedupe by serial + dedupe logic already in place |
| **Recommendations** | `recommendations` | Union; show per-location column |
| **Initiatives** (Roadmap) | `initiatives` | Union; show per-location grouping in Kanban |
| **Goals** | `goals` | Union; show per-location badge on each goal |
| **Action Items** (Activities) | `activities` / `action_items` | Chronological feed across all children |
| **Agreements** | `contracts` | Union |
| **Assessments** | `assessments` | Per-location list with most-recent-completed highlighted |
| **Health score** | `clients.health_score` | Weighted average by seat count or flat average |
| **Alignment by domain** | `clients.alignment_score_by_domain` | Average per domain |

## UI Surface: Parent Dashboard

Parent clients (where `EXISTS (SELECT 1 FROM clients WHERE parent_client_id = :id)`)
get a **Scope toggle** at the top of their Dashboard:

```
[ Enterprise ]  [ Location breakdown ]
```

### Enterprise scope (default for parents)

All widgets show aggregated data:
- **DMI score** — weighted avg (by seat count) of child DMI scores
- **Assessment Summary** — latest assessment per location, tabular
- **Roadmap preview** — initiatives across ALL locations, grouped by
  quarter, each tagged with source location
- **Agreements** — combined expiring-soon list across locations
- **Insights / High-risk** — OR logic — if ANY location has the risk,
  show it here with location chip

### Location breakdown scope

Horizontal tab row at top showing each child location as a tab:

```
[ All ] [ Tampa ] [ Orlando ] [ Miami ] [ + more ... ]
```

Click a tab → Dashboard re-scopes to that single location (same
behavior as navigating to the child client directly). Allows the vCIO
to pivot between locations in one meeting without leaving the parent
context.

### Locations tab

Already exists on parent Dashboard. Add:
- Assets count per location
- Open initiatives count per location
- Most recent assessment date per location
- Health score per location (colored chip)
- Link to each location's Dashboard

## Implementation Notes

**Schema (already in place):**
```
clients
  parent_client_id  uuid → clients.id (nullable)
```

**Additional columns to consider:**
```
clients
  location_role  text        e.g., 'headquarters' | 'branch' | 'regional'
  seat_count     int          for weighted rollups
  location_code  text         short label for tabs (e.g., 'Tampa')
```

**Endpoints to add:**
```
GET /api/clients/:id/rollup?include=assets,recommendations,initiatives,goals,agreements
   Returns parent data + union of all children's data in one response.
   Each item tagged with source_location_id + source_location_name.

GET /api/clients/:id/rollup/health
   Returns weighted DMI / health_score / alignment_score_by_domain
   rolled up across children.

GET /api/clients/:id/children
   Basic list — already exists.
```

**Query pattern** (example for recommendations):

```sql
SELECT r.*, c.name AS source_location_name, c.id AS source_location_id
FROM recommendations r
JOIN clients c ON c.id = r.client_id
WHERE c.id = :id OR c.parent_client_id = :id
ORDER BY r.created_at DESC
```

**Frontend:**
- `client/src/pages/ClientDetail.jsx` — add Scope toggle when client
  is a parent; pass scope down to tab components
- `client/src/pages/Roadmap.jsx` — accept a multi-client scope; when
  parent scope, show location chip on each card
- `client/src/pages/Recommendations.jsx` — accept multi-client; add
  Location column
- `client/src/components/LocationBreakdownTabs.jsx` — new horizontal
  tab row for Location breakdown scope

## Reporting Implications

All the Deliverables exports (see `deliverables-spec.md`) need to
accept an `enterprise=1` flag:

```
GET /api/exports/roadmap/:clientId/:year?format=pdf&enterprise=1
```

When `enterprise=1`:
- Roadmap export lists initiatives grouped by **location first**, then
  quarter within each location
- Budget export has one sheet per location + a rolled-up "All locations"
  sheet
- Assessment export doesn't support enterprise (each assessment is
  per-location; the Deliverables catalog shows them separately)

## Related Docs

- [`navigation-redesign.md`](./navigation-redesign.md) — Locations are
  visible via the existing MANAGE > (no, wait) — Locations are surfaced
  via the parent Dashboard Scope toggle, not via a separate sidebar item
- [`roadmap-redesign.md`](./roadmap-redesign.md) — Roadmap needs to
  handle multi-client scope for enterprise rollup
- [`deliverables-spec.md`](./deliverables-spec.md) — exports accept an
  `enterprise=1` flag
