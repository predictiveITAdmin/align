# UI Actionability Plan — Pop-up Cards, Widgets & Client Detail Parity

**Status:** Planned  •  **Owner:** Jason  •  **Last updated:** 2026-04-22

This document captures every place in the Align UI where a widget, stat tile, detail card,
or entity reference should be interactive but isn't — and exactly what to build to fix it.
It also specifies bringing the Client Detail procurement tabs to full parity with their
global-page counterparts.

---

## Summary of Issues Found

Four categories of gaps:

1. **Entity references that aren't links** — client names, opportunity titles, order numbers,
   quote numbers shown in detail cards/tables but not clickable
2. **Stat tiles with no click-to-filter** — summary counts that display data but don't drive
   the list below them
3. **Client Detail procurement tabs missing interactive features** — the Opportunities, Quotes,
   and Orders sub-tabs in ClientDetail are read-only summary tables with no filters, no row-click
   detail cards, and no sorting, compared to their full-featured global equivalents
4. **Missing date range + match filters on Orders global page** — Orders page lacks date range
   filtering

---

## Section 1: Entity Links (click-through navigation)

### 1A. OppDetail slide-over (Opportunities page)

**File:** `client/src/pages/Opportunities.jsx` — the right-side slide-over panel

| Field | Current | Fix |
|-------|---------|-----|
| Client name (header) | Plain text | Link → `/clients/{client_id}` |
| Linked Orders — distributor order number | Plain text | Opens OrderDetail slide-over (keep user on page, or link to `/orders?order={id}`) |
| Linked Orders — opportunity title | N/A | Already in context |
| Quote number in expanded quotes list | Toggle-expand only | Add small "↗" icon → opens full quote detail (or scrolls to quote in ClientDetail Quotes tab) |

**Implementation:**
```jsx
// Client name — wrap in Link
<Link to={`/clients/${selectedOpp.client_id}`} className="text-blue-600 hover:underline">
  {selectedOpp.client_name}
</Link>

// Order number — on click, set selectedOrder and show OrderDetail slide-over alongside OppDetail
// (or navigate to /orders with order pre-selected)
```

### 1B. OrderDetail slide-over (Orders page)

**File:** `client/src/pages/Orders.jsx` — the right-side slide-over panel

| Field | Current | Fix |
|-------|---------|-----|
| Client name | Plain text | Link → `/clients/{client_id}` |
| Opportunity title | Plain text | Opens OppDetail slide-over (keep user on page) or link → `/opportunities?opp={id}` |
| Quote number | Plain text | Link → ClientDetail Quotes tab: `/clients/{client_id}?tab=procurement-quotes` |

### 1C. Orders table rows (Orders page)

| Field | Current | Fix |
|-------|---------|-----|
| Opportunity title column | Plain text | Add small pill/link that opens OppDetail or navigates to `/opportunities?opp={id}` |

### 1D. Client Detail — Procurement tabs

**File:** `client/src/pages/ClientDetail.jsx`

| Tab | Entity | Current | Fix |
|-----|--------|---------|-----|
| Opportunities | Opportunity title | Plain text | Click → opens OppDetail slide-over (import same component) |
| Quotes | Quote title | Plain text | Already expands inline line items — add "Full Detail" button or make title a link |
| Quotes | Opportunity title | Plain text | Click → opens OppDetail slide-over |
| Orders | Opportunity title | Plain text | Click → opens OppDetail slide-over |
| Orders | Row click | No handler | Click → opens OrderDetail slide-over (import same component) |

### 1E. Assessments page

| Entity | Current | Fix |
|--------|---------|-----|
| Client name in assessment card | Plain text | Link → `/clients/{client_id}` |

### 1F. Standards inline detail

| Entity | Current | Fix |
|--------|---------|-----|
| Section name (metadata tab) | Plain text | Click → filters Standards list to that section |
| Category name (metadata tab) | Plain text | Click → filters Standards list to that category |

---

## Section 2: Stat Tiles — Click to Filter

### 2A. Opportunities page stat tiles

**File:** `client/src/pages/Opportunities.jsx` — the row of 7 tiles above the table

| Tile | Current onClick | Required onClick |
|------|----------------|-----------------|
| Open | ✅ Sets `statusFilter='open'` | No change |
| Won / Implemented | ✅ Sets `statusFilter='won'` | No change |
| Lost / Not Ready | ✅ Sets `statusFilter='lost'` | No change |
| All | ✅ Sets `statusFilter='all'` | No change |
| **With PO Numbers** | ❌ None | Set a filter: show only opps where `po_numbers.length > 0` |
| **With Orders** | ❌ None | Set a filter: show only opps where linked orders count > 0 |
| **Pipeline Value** | ❌ None (display only) | Display only is OK — but make it clearly non-clickable (no cursor-pointer) to avoid confusion |

**Implementation — "With PO Numbers" tile:**
```jsx
// Add state
const [hasPOFilter, setHasPOFilter] = useState(false)

// Tile onClick
onClick={() => setHasPOFilter(f => !f)}  // toggle

// In filtered useMemo
if (hasPOFilter) results = results.filter(o => o.po_numbers?.length > 0)
```

Same pattern for "With Orders" (filter on `linked_orders_count > 0`).

### 2B. Orders page stat tiles

**File:** `client/src/pages/Orders.jsx`

| Tile | Current onClick | Required onClick |
|------|----------------|-----------------|
| Total Orders | ❌ None (display only) | Display only is fine — remove cursor-pointer |
| **Unmapped** | ✅ Sets `matchFilter='unmapped'` | No change |
| **Needs Review** | ✅ Sets `matchFilter='needs_review'` | No change |
| **In Transit** | ❌ None | `setStatFilter('status', 'shipped')` — filter to orders with status = `shipped` or `partially_shipped` |
| **Backordered** | ✅ Sets status filter | No change |
| **Delivered** | ✅ Sets status filter | No change |

---

## Section 3: Client Detail Procurement Tab Parity

The Opportunities, Quotes, and Orders sub-tabs inside ClientDetail need to be brought up to the
same interactive level as their global counterparts. The goal is: **everything you can do on
the global page, you should be able to do within the context of a single client.**

### 3A. Client Opportunities Tab — full parity spec

**Current state:** Active/All toggle + read-only table, no row-click, no filters

**Target state:**

**Filters to add (above the table):**
- Status group tabs: Active / Won / Lost / All (same as global page's Open/Won/Lost/All)
- Stage single-select dropdown
- Category single-select dropdown
- Owner multi-select (scoped to resources assigned to this client's opps)
- Close Date date range with presets (This Week / Last Month / etc.)
- Create Date date range with presets
- Search box (title search)

**Row click → OppDetail slide-over:**
- Import/reuse the same `OppDetail` slide-over from the global Opportunities page
- Pre-populate with the clicked opportunity
- The slide-over already shows Quotes, linked Orders, and all fields

**Summary stat tiles (above filters):**
- Open count | Won count | Lost count | Total Pipeline $ | Orders count — same tiles as global but scoped to this client; clicking tiles filters the table

**Table columns to add:**
- Owner
- Category
- Created Date
- Close Date
- Closed Date (when showing won/lost)

### 3B. Client Quotes Tab — full parity spec

**Current state:** Expand-inline-only, no filters, quote/opp titles not clickable

**Target state:**

**Filters to add:**
- Status filter (Active / Expired / All)
- Opportunity selector (filter quotes by which opportunity)
- Search box (quote number / title search)

**Row detail:**
- Keep the existing inline line-item expansion (it's useful)
- Add a "Full Detail" / "↗" icon that opens a QuoteDetail slide-over showing:
  - Quote number, status, amount, valid until, PO numbers
  - Linked opportunity (clickable)
  - Line items table (same as current inline expansion)
  - Source (QuoteWerks / KQM)

**Summary stat:**
- Quote count | Total amount (all quotes for client)

### 3C. Client Orders Tab — full parity spec

**Current state:** Read-only table, no row-click, no filters

**Target state:**

**Filters to add (match global Orders page):**
- Open / All History toggle (same as global Open Orders default)
- Distributor filter (dropdown)
- Status filter (only shown in All History mode)
- Match status filter (Unmapped / Needs Review / Matched)
- Search (PO#, order ID, tracking number)

**Row click → OrderDetail slide-over:**
- Import/reuse the same `OrderDetail` slide-over from the global Orders page
- Also import the `POMapperModal` so unmapped orders can be mapped from within the client view

**Summary stat tiles:**
- Unmapped count (clickable → filter to unmapped)
- Backordered count (clickable → filter to backordered)
- In Transit count (clickable → filter to shipped/partially_shipped)

---

## Section 4: Date Range Filters on Orders Global Page

**File:** `client/src/pages/Orders.jsx`

The global Orders page has no date range filtering. Add:

| Filter | Preset options | Notes |
|--------|---------------|-------|
| Order Date | This Week / Last Week / This Month / Last Month / Next Month + custom range | Same `DateRangeFilter` component from Opportunities page |
| Expected Delivery | Same presets | Only available on open orders |

Implementation: import and reuse the `DateRangeFilter` component and `inDateRange()` helper
already built in `Opportunities.jsx`.

---

## Section 5: Dashboard Widgets

**File:** `client/src/pages/Dashboard.jsx`

The four stat cards at the top are currently mostly display-only or hardcoded:

| Card | Current Value | Actionable Fix |
|------|--------------|----------------|
| Total Clients | Live count | Clicking → `/clients` page |
| Assessments Due | Hardcoded "—" | Wire to real data (`assessments` where status = In Progress + due_date < 30 days out); click → Assessments page filtered to due |
| Open Recommendations | Hardcoded "—" | Wire to real count; click → Recommendations page |
| Avg. CSAT Score | Hardcoded "—" | Wire to Customer Thermometer data (already synced); click → CSAT detail |

---

## Implementation Priority

### P1 — High impact, relatively easy (1-3 hours each)
1. **Entity links in OppDetail slide-over** — client name → `/clients/{id}`
2. **Entity links in OrderDetail slide-over** — client name → `/clients/{id}`, opportunity title → opp detail
3. **Stat tile onClick: Opportunities "With PO Numbers" + "With Orders"** — add filter state + useMemo filter
4. **Stat tile onClick: Orders "In Transit"** — add status filter
5. **Assessment card: client name link** → `/clients/{id}`

### P2 — Medium impact, medium effort (half day each)
6. **Client Detail Opportunities Tab:** Add OppDetail row-click + status/stage/category filters
7. **Client Detail Orders Tab:** Add OrderDetail row-click + distributor/status/match filters + Open/All toggle
8. **Orders global page:** Add date range filters (reuse existing DateRangeFilter component)

### P3 — Higher effort, major improvement (1+ day each)
9. **Client Detail Opportunities Tab:** Full filter parity (owner multi-select, date range filters, summary tiles)
10. **Client Detail Quotes Tab:** Add QuoteDetail slide-over, filters
11. **Dashboard stat cards:** Wire live data + click-through navigation
12. **Standards inline detail:** Section/Category → filter clicks

---

## Reusable Components to Build/Extract

Several components should be extracted from Opportunities.jsx and reused:

| Component | Source | Reuse in |
|-----------|--------|---------|
| `OppDetail` slide-over | `Opportunities.jsx` (inline JSX) | ClientDetail Opportunities tab, OrderDetail (cross-link) |
| `DateRangeFilter` | `Opportunities.jsx` (inline component) | Orders global page, ClientDetail tabs |
| `MultiSelectFilter` | `Opportunities.jsx` (inline component) | ClientDetail tabs, Orders page |
| `OrderDetail` slide-over | `Orders.jsx` (inline JSX) | ClientDetail Orders tab |

**Recommendation:** Extract these four as standalone components in `client/src/components/`
before building the client detail tab parity work — it will make those implementations much
faster and keeps the code DRY.

---

## Notes for Implementation

- The `OppDetail` slide-over already fetches quote + order data when an opp is selected
  (via `/api/opportunities/{id}/quotes` and linked orders endpoint). Reusing it in
  ClientDetail requires no API changes — just pass the opp ID.
- The `OrderDetail` slide-over already handles the POMapperModal. Reusing it in ClientDetail
  orders tab provides the full mapper UI for free.
- `DateRangeFilter` and `MultiSelectFilter` are currently defined as function components
  *inside* `Opportunities.jsx`. Extract them to `client/src/components/DateRangeFilter.jsx`
  and `client/src/components/MultiSelectFilter.jsx`.
