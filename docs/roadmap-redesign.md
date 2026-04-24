# Roadmap Page Redesign — Kanban + List, Drag-and-Drop

**Status:** Planned (2026-04-24). Not yet built. Visual reference is
LMX (ScalePad Pro+X) Roadmap; screenshots in
`uploads/nav-screenshots/` (Kanban view, List view).

Replaces the current Roadmap page with a toggleable **Kanban** (drag-and-drop
by quarter) or **List view** (sortable table grouped by quarter). One-click
fiscal-year navigation, filters, share-with-client, per-column financial
rollups.

---

## Two Views, One Toggle

```
[ Roadmap view ]  [ List view ]     [ New Initiative + ]   [ Share with client... ]
```

Toggle lives top-right in the page header. The active view is highlighted
blue. Default is Kanban (Roadmap view). State persisted to localStorage
per-user.

## Kanban View (default)

### Column layout

One column per quarter for the selected fiscal year plus a **"Not Scheduled"**
column at the far left. Columns render left-to-right:

```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Not          │ Q1 2026      │ Q2 2026      │ Q3 2026      │ Q4 2026      │
│ Scheduled    │              │              │              │              │
│              │              │              │              │              │
│ [totals]     │ [totals]     │ [totals]     │ [totals]     │ [totals]     │
│ $0 | $0/M    │ $5,000       │ $0 | $0/M    │ $0 | $0/M    │ $0 | $0/M    │
│ | $0/Y       │ | $0/M       │ | $0/Y       │ | $0/Y       │ | $0/Y       │
│              │ | $0/Y       │              │              │              │
│              │              │              │              │              │
│ [cards...]   │ [cards...]   │ ...          │ ...          │ ...          │
│              │              │              │              │              │
│ [+]          │ [+]          │ [+]          │ [+]          │ [+]          │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### Column header

- **Icon** (calendar) + **label** — "Q2 2026" or "Not Scheduled"
- **Financial rollup** — 3 values on one line:
  - Total one-time fees sum
  - Monthly recurring sum (`$X/M`)
  - Annualized recurring sum (`$X/Y`)
  - Excludes initiatives with `status='not_applicable'` or archived
- **[+] button** top-right — adds a new initiative pre-scheduled to
  that quarter (or "Not Scheduled" for that column)
- **Empty state** — "No initiatives created." centered vertically

### Initiative card

```
┌──────────────────────────────────────┐
│ ⋮⋮  Initiative Name                  │
│                                      │
│  [ Status dropdown: Open         v ] │
│                                      │
│  Labor                    $5,000.00 │
│  Total one-time fees:     $5,000.00 │
│                                      │
│  Total recurring fees:     $0.00/month│
│                                      │
│  ‼  🔗                               │
└──────────────────────────────────────┘
```

**Card fields (top to bottom):**
- **Drag handle** (`⋮⋮` grip icon) on the left of the title — cursor
  changes to `grab` on hover, `grabbing` during drag
- **Initiative title** (links to the initiative detail slide-over on
  click, separately from drag)
- **Status dropdown** (inline edit — updates on change):
  `Open | In Progress | Complete | On Hold | Not Applicable`
- **Fee breakdown** (shown when Card info toggle = "View fees"):
  - Line items by category (Labor, Hardware, Software, Subscription, etc.)
  - Total one-time fees (sum)
  - Total recurring fees (monthly)
- **Footer icons:**
  - Priority indicator (colored `!`, `!!`, `!!!`)
  - PSA link icon (🔗) — shows linked Autotask Ticket or Opportunity
    on hover; click opens in new tab

### Drag-and-drop mechanics

- **Library:** Use `@dnd-kit/core` or `react-beautiful-dnd` (pick whichever
  has better maintenance — likely @dnd-kit)
- **Drag behavior:**
  - Grab anywhere on the drag handle OR the card body (not the status
    dropdown or the title link)
  - During drag: card semi-transparent (`opacity-60`), drop zones
    highlighted on every column
  - Drop: optimistic update; `PATCH /api/initiatives/:id` with
    `scheduled_quarter` and `scheduled_year`
- **Dropping on "Not Scheduled"** clears the schedule:
  - Sets `scheduled_quarter = null`, `scheduled_year = null`
  - Backend accepts null + absent
- **Cross-year drops** — disabled by default; if a future initiative
  should go into Q1 2027, user navigates the fiscal year first (see
  Year Navigator below). Prevents accidental misdrops.
- **Server errors** — rollback the optimistic move and toast the error

## List View

Same page, different render. Toggle via the top-right buttons.

### Layout

Single scrolling table. Rows grouped by quarter band:

```
┌── Not scheduled ───────────────────────────────────────────────────────────┐
│ Initiative | Scheduled | POC | Status | Priority | 1-time | Recurring | PSA│
│ ...no rows if none...                                                      │
└────────────────────────────────────────────────────────────────────────────┘

┌── 📅 2026 ─────────────────────────────────────────────────────────────────┐
│ Initiative                   | Scheduled v | POC          | Status v | ...│
│ VMWare to Hyper-V Migration  | Q2 v        | Jason Lang   | Open v   | ‼  │
│                              |             |              |          |     │
│                              | $5,000.00   | -            | -        | -  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Columns (sortable by clicking header chevron)

| Column | Source | Behavior |
|---|---|---|
| Initiative | `initiatives.name` | Links to detail slide-over |
| Scheduled | `scheduled_quarter` | Inline dropdown (Q1/Q2/Q3/Q4/Not Scheduled) — edits in place |
| POC | `point_of_contact_name` | Text or dropdown from client contacts |
| Status | `status` | Inline dropdown (Open / In Progress / Complete / On Hold / N/A) |
| Priority | `priority` | Icon-only column (`!` / `!!` / `!!!`) with color; click to cycle |
| One-time fees | computed sum | Right-aligned, currency format; click to open fee editor |
| Recurring fees | computed sum | Right-aligned, `$X/M` format |
| PSA Ticket | linked AT ticket | Icon + number, link to AT |
| PSA Opportunity | linked AT opp | Icon + number, link to AT |

Sort indicators on each column header (chevron up/down).

### Quarter band headers

Collapsible (click the band header to fold/unfold). Each band shows
the quarter label (`📅 2026`, `Not scheduled`) and, when expanded,
its rows.

## Shared Top Bar

```
[ < 2025 ]  [ 2027 > ]  [ 📅 2026 ]   ... filters ...   [Fiscal year started: Jan 2026 ⚙]
```

### Year navigator

- `< 2025` — go back one fiscal year
- `2027 >` — go forward one fiscal year
- `📅 2026` — current quarter indicator (clickable to jump to current
  quarter in view)
- In Kanban view, the year nav shows **quarters**: `< Q1, 2026` / `Q1, 2027 >`
  / `📅 Current quarter` — because Kanban columns ARE quarters
- In List view, the year nav shows **years**: `< 2025` / `2027 >` /
  `📅 2026` — because List groups by year+quarter bands

### Filters (top-left row)

| Filter | Source | Default |
|---|---|---|
| Target quarter | List view only | All quarter |
| Status | `initiatives.status` enum | All status |
| Priority | `initiatives.priority` enum | All priority |
| POC | distinct `point_of_contact_name` | All poc |
| Card info (Kanban only) | toggle: `View fees` / `Hide fees` | View fees |
| Not scheduled | toggle: include/exclude | Include (on) |
| Clear All | button | resets filters |

### Fiscal year setting

Gear icon next to "Fiscal year started: Jan 2026" opens a small modal
to change the tenant's fiscal year start month. Persisted in
`tenants.fiscal_year_start_month` (integer 1-12, default 1).

## New Initiative Modal

Button `New Initiative +` top-right. Opens a modal:

```
┌── New Initiative ────────────────────────────────────────┐
│                                                          │
│  Name*                                                   │
│  [                                                     ] │
│                                                          │
│  Client*                                                 │
│  [ (preselected if on client dashboard)               v] │
│                                                          │
│  Priority    Status       Scheduled                      │
│  [ Med v ]  [ Open v ]    [ Q2 2026 v ]                  │
│                                                          │
│  POC                                                     │
│  [                                                     ] │
│                                                          │
│  Fee Schedule                      (+ Add line)          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Category  | Description | One-time | Recurring     │  │
│  │ Labor   v |             | $        | $     / month │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Link to PSA                                             │
│  [ Link Ticket / Opportunity ... ]                       │
│                                                          │
│                             [ Cancel ]  [ Create ]       │
└──────────────────────────────────────────────────────────┘
```

**Fee categories:** Labor, Hardware, Software, Subscription, Consulting,
Other (all stored as `initiative_fees.category`)

## Share with Client

Button `Share with client... 🛜` top-right. Opens a share modal:

- Generates a signed read-only URL (expires in 30 days default,
  configurable)
- Client-facing view: same layout but **no edit affordances** (no
  drag handles, no inline status change, no `[+]` or `New Initiative`
  buttons)
- Can toggle fee visibility (show `$`, hide `$`, show ranges)
- Link copies to clipboard + emails to selected client contacts

## Data Model

No new tables needed — the existing `initiatives` schema already has
most of this:

```
initiatives
  id, tenant_id, client_id, name, description
  priority             enum: low | medium | high | critical
  status               enum: open | in_progress | complete | on_hold | not_applicable
  scheduled_quarter    int 1-4 (nullable = "Not Scheduled")
  scheduled_year       int (nullable)
  point_of_contact_id  uuid → users.id (or nullable + point_of_contact_name)
  autotask_ticket_id   int
  autotask_opportunity_id int
  ...

initiative_fees
  id, initiative_id
  category             enum/text: labor | hardware | software | subscription | consulting | other
  description          text
  one_time_amount      numeric
  monthly_recurring    numeric
```

Schema additions (if not present):
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fiscal_year_start_month int DEFAULT 1;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS scheduled_quarter int;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS scheduled_year int;
```

## Endpoints

- `GET /api/initiatives?client_id=&year=` — list for client, flat
- `POST /api/initiatives` — create (body matches modal fields above)
- `PATCH /api/initiatives/:id` — update (supports single-field edits
  from inline dropdowns + drag-drop schedule changes)
- `DELETE /api/initiatives/:id`
- `GET /api/initiatives/:id/fees` — line items for fee breakdown
- `POST /api/initiatives/:id/share` — generate client-shareable URL

## Implementation Notes

**Files that change:**
- `client/src/pages/Roadmap.jsx` — rewrite as two subcomponents
  (`RoadmapKanban.jsx`, `RoadmapList.jsx`) with shared top bar
- New: `client/src/components/InitiativeCard.jsx` — Kanban card
- New: `client/src/components/InitiativeListRow.jsx` — List row with
  inline editors
- New: `client/src/components/NewInitiativeModal.jsx`
- New: `client/src/components/ShareRoadmapModal.jsx`
- `src/routes/initiatives.js` — PATCH validation, share endpoint,
  fiscal-year-aware quarter bucketing

**DnD library decision:** @dnd-kit/core + @dnd-kit/sortable (more
actively maintained than react-beautiful-dnd; smaller bundle)

**Performance:** For clients with 50+ initiatives, virtualize the List
view using react-window. Kanban columns unlikely to exceed 20 items
each, so raw DOM is fine.

## Related Docs

- [`navigation-redesign.md`](./navigation-redesign.md) — overall nav
  structure (Roadmap lives under PLAN > Roadmap in client sidebar)
- [`deliverables-spec.md`](./deliverables-spec.md) — Word/PDF/Excel
  export of Roadmap (MVP deliverable)
