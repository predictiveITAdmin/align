# Order Management Module — SPEC

**Status:** Requirements locked, ready to design schema  •  **Owner:** Jason  •  **Last updated:** 2026-04-21

## Purpose

Single pane of glass for **hardware procurement**. Pulls Opportunities and Quotes
from Autotask, pulls orders from hardware distributors, and joins them via PO
number (or client/address fallback). Also closes the loop back to QuickBooks
Online for receiving, and gives clients visibility via a customer-facing portal.

**Explicitly out of scope:** software / SaaS subscriptions (Pax8 and similar
handle that separately). This module is for **physical product orders** — drop-
shipped to clients, needs delivery + serial + warranty tracking.

## Current pain points (what we're replacing)

- Quote lives in **QuoteWerks** (primary) or **KQM** → auto-creates AT Opp + Quote
- PO generated out of QuoteWerks → pushed to **QuickBooks Online** (bill creation)
- PO is used to place order in distributor website (manual entry) or emailed to distributor
- **Manual step:** typing the PO back into the Autotask Opportunity's PO field
- **Manual step:** monitoring distributor portals for shipping / tracking
- **Manual step:** confirming receipt and telling accounting what arrived
- **Manual step:** entering serials + assigning to users as assets
- Client has no visibility — gets emails from MSP staff manually

## Workflow context

```
┌─────────────┐   auto   ┌─────────────┐
│ QuoteWerks  │ ───────→ │  Autotask   │  (Opp + Quote created, linked)
│  or KQM     │          │  Opp + Quote│
└──────┬──────┘          └─────┬───────┘
       │ PO via API             │ PO field (manual entry today — comma-separated
       ↓                        │                           for multi-distributor)
┌─────────────┐                 │
│ QuickBooks  │                 │
│ Online (PO) │                 │
└─────────────┘                 │
                                ↓
                         Distributor portal(s)  (manual order placement)
                                ↓
                          Distributor APIs
                                ↓
                   ┌────────────────────────┐
                   │  Align Order Manager   │
                   │  (sync + match + UI)   │
                   └──────┬───────────┬─────┘
                          │           │
                  ┌───────▼─────┐  ┌──▼──────────────┐
                  │ Back to QBO │  │ Client Portal   │
                  │ on receive  │  │ (status, confirm│
                  │             │  │ receipt, Q&A)   │
                  └─────────────┘  └─────────────────┘
```

## Core user stories

1. **TAM / dispatcher:** One list of all open orders across distributors with
   status, ETA, tracking, and which client/opportunity they belong to.
2. **vCIO:** Full procurement trail for a client — Opp → Quote → Order(s) →
   Shipments → Assets — with human checkpoints for budget/assignment decisions.
3. **MSP owner:** Reports on order volume by distributor, cycle time, fill rate,
   distributor cost variance vs quote, backorder rate.
4. **Accounting:** When an order is received in Align, QuickBooks PO gets the
   received-quantity update automatically so bills can be matched against
   received items.
5. **Technician:** Sees what's shipped and arriving so deployment can be
   scheduled. Serial numbers + warranty start auto-populate as assets.
6. **Client contact:** Amazon-style visibility — email on order confirmed,
   shipped, delivered; client dashboard shows current orders; client confirms
   receipt and answers questions (is this a replacement? which asset? assign
   to whom?).

## Distributors (priority order)

**Product/hardware-focused only:**

| Priority | Distributor | Notes |
|---|---|---|
| 1 | **Ingram Micro** | Xvantage platform (2024+). High volume. |
| 1 | **TD Synnex** | SynnexConnect / ECExpress. High volume. |
| 2 | **Provantage** | Smaller. API availability TBD — research needed. |
| 2 | **Amazon Business** | SP-API + Business Order APIs. Auth complex. |
| 3 | **D&H, Arrow, ScanSource, others** | Future phase, roadmap only. |
| — | Pax8 | Software-only, **skip** for this module. |

⚠ **Research note:** Most distributors' *marketed* APIs are for software
subscriptions (O365, etc.). The hardware/physical-product APIs are separate
and usually require direct partner engagement to gain access. Research phase
must specifically target hardware ordering endpoints.

## Sync cadence

**Hourly scan** of all enabled distributors → pull new + updated orders +
shipments → run matcher → update UI + trigger notifications.

## Data model

```
-- ── Autotask — Opportunities / Quotes / Items ──────────────────────────────

opportunities                          ← AT Opportunities
  id uuid PK
  tenant_id uuid
  client_id uuid FK
  autotask_opportunity_id bigint UNIQUE
  title, stage, amount, expected_close,
  po_numbers text[]                    ← array; AT's PO field is parsed comma-sep
  assigned_resource_id,
  source text                          ← 'quotewerks' | 'kqm' | 'manual'
  created_at, closed_at,
  metadata jsonb                       ← full AT payload
  last_synced_at

quotes                                 ← AT Quotes
  id uuid PK
  opportunity_id FK
  autotask_quote_id bigint UNIQUE
  quote_number, status, amount, valid_until
  source text                          ← 'quotewerks' | 'kqm'
  quote_external_ref text              ← QuoteWerks doc ID or KQM ref
  metadata jsonb
  last_synced_at

quote_items                            ← AT QuoteItems
  id uuid PK
  quote_id FK
  autotask_quote_item_id bigint UNIQUE
  mfg_part_number text                 ← PRIMARY product identifier
  manufacturer, description,
  quantity, unit_cost, unit_price, line_total
  metadata jsonb

-- ── Distributor orders ────────────────────────────────────────────────────

distributor_orders
  id uuid PK
  tenant_id uuid
  distributor text                     ← 'ingram' | 'synnex' | 'provantage' | 'amazon_business'
  distributor_order_id text            ← distributor's ID
  po_number text                       ← the join key
  order_date timestamptz
  status text                          ← normalized (see status enum below)
  status_raw text                      ← distributor's exact text
  subtotal, tax, shipping, total
  ship_to_name, ship_to_address jsonb

  -- Match results
  opportunity_id FK NULL
  quote_id FK NULL
  client_id FK NULL
  match_confidence int NULL            ← 100 = PO exact, 80 = PO fuzzy, 60 = client name, 40 = address
  match_method text                    ← 'po_exact' | 'po_fuzzy' | 'client_name' | 'address' | 'manual'
  match_status text                    ← 'matched' | 'needs_review' | 'unmapped'

  metadata jsonb, last_synced_at
  UNIQUE (distributor, distributor_order_id)

distributor_order_items
  id uuid PK
  distributor_order_id FK
  distributor_line_id text
  mfg_part_number text                 ← join to quote_items via mfg_part_number
  manufacturer, description,
  quantity_ordered, quantity_shipped, quantity_backordered, quantity_cancelled,
  unit_cost, line_total

  -- Shipping
  tracking_number text, carrier text
  ship_date date, expected_delivery date
  serial_numbers text[]                ← populated from distributor API if provided
  serials_confirmed_by_user uuid NULL  ← who verified serials on unboxing
  serials_confirmed_at timestamptz NULL

  -- Links
  quote_item_id FK NULL                ← matched by mfg_part_number within the matched Opp
  asset_id FK NULL                     ← created in assets on receipt + assignment
  metadata jsonb

-- ── Events / audit trail ──────────────────────────────────────────────────

order_events
  id uuid PK
  distributor_order_id FK
  event_type text                      ← order_created | status_change | shipment |
                                          backorder | delivered | receipt_confirmed |
                                          serial_entered | asset_created | qbo_synced |
                                          po_mapped | client_notified
  event_date timestamptz
  description text
  actor text                           ← 'system' | user_id | 'client'
  metadata jsonb
  created_at

-- ── Receipt + assignment (human step after delivery) ──────────────────────

order_receipts
  id uuid PK
  distributor_order_id FK
  received_at timestamptz
  received_by uuid                     ← MSP user OR client contact
  received_by_type text                ← 'msp_staff' | 'client_contact'

  -- Per-line asset decisions (one receipt → many asset_assignments)
  notes text
  all_items_confirmed bool DEFAULT false

order_item_assignments                 ← one row per qty received, allows splitting
  id uuid PK
  distributor_order_item_id FK
  receipt_id FK
  assignment_type text                 ← 'new' | 'additional' | 'replacement'
  replacing_asset_id FK NULL           ← if replacement
  assigned_user_id text NULL           ← who gets it (client user)
  assigned_location text NULL          ← office/room
  serial_number text
  asset_id FK NULL                     ← created asset row
```

### Status enum (normalized across distributors)

```
pending_submission | submitted | confirmed |
partially_shipped | shipped | out_for_delivery |
delivered | receipt_confirmed |
backordered | cancelled | returned | exception
```

Each distributor's raw status maps to this. Kept distinct so we can filter.

## PO matching / mapping flow

### Auto-match (hourly sync)

For each new/updated distributor order:

1. **Extract candidate POs** from distributor order (PO field)
2. **Scan Autotask opportunities** where `po_numbers @> ARRAY[po_from_distributor]`
   → exact match (confidence 100, status 'matched')
3. If no exact match, **fuzzy PO match** (trim whitespace, case-insensitive,
   strip prefixes like "PO-", "PO#", etc.) → confidence 80, status 'needs_review'
4. If still no match, **client name match** — distributor's ship-to company name
   fuzzy-matches a client.name → confidence 60, status 'needs_review'
5. **Address fuzzy match** — ship-to address matches client's address →
   confidence 40, status 'needs_review'
6. **No match at all** → confidence NULL, status 'unmapped'

### Manual PO Mapper UI

Global page: `/orders/unmapped` (accessible from badge on global Orders page)

Layout:
- Left pane: list of unmapped / needs-review orders (sorted by date desc)
- Right pane: selected order detail
  - Distributor info (name, order ID, PO, total, ship-to)
  - Line items (SKU, qty, description)
  - **Match suggestions** (automated candidates ranked by confidence)
  - **Manual search** — pick any client + opportunity via autocomplete
  - **"Map" button** — on confirm:
    1. Writes `opportunity_id`, `quote_id`, `client_id`, `match_method='manual'`
    2. **Appends PO to Autotask Opportunity's PO field** (comma-separated)
       via Autotask API `PATCH /Opportunities/:id`
    3. Writes `order_events` row: `po_mapped` with actor + timestamp
    4. Line item matcher runs for the newly linked order (SKU → quote_item)

### Manual unmap / re-map

If an order was wrongly auto-matched, the detail view supports unmap → removes
the link and removes the PO from the opp's list (with confirmation prompt).

## QuickBooks Online integration (bidirectional)

### Already present (via QuoteWerks → QBO)

- QuoteWerks pushes PO creation to QBO on quote approval. PO lives in QBO
  before Align sees the distributor order.
- Align does NOT create the QBO PO — that stays in QuoteWerks flow.

### What Align adds

**On receipt confirmation (MSP staff OR client confirms delivery):**
- Call QBO API to update the matching PO:
  - Set received-quantity per line item
  - Mark PO as fully received (if all lines shipped + confirmed)
- Write `order_events.qbo_synced` audit entry
- On error → retry queue + UI badge for accounting to handle manually

**New integration needed:**
- QuickBooks Online OAuth + API client (new service in
  `src/services/quickbooks.js`)
- Store QBO OAuth refresh token per tenant
- Map QBO PO by PO number (same key we use everywhere)

### QBO data we need access to
- Purchase Orders (read + update received-quantity)
- Vendors (to confirm PO belongs to right vendor)
- Items (to match line items by mfg part #)

## Customer-facing portal

### Access model

- Client contacts (already exist in Align's `client_contacts` table) can be
  invited to a client portal with email + magic-link or OAuth login
- Permissions per-contact: `can_view_orders`, `can_confirm_receipt`,
  `can_assign_users`
- New lightweight UI subdomain or path: `align.predictiveit.ai/client/*` with
  simpler navigation scoped to that client's data

### Client pages

1. **Client dashboard** (`/client/dashboard`)
   - Open orders count, recent shipments, pending receipt confirmations
2. **My Orders** (`/client/orders`)
   - List view, same columns as global Orders but scoped to this client
   - Amazon-style status tracker on each order
   - Click → detail with line items, tracking links, estimated delivery
3. **Receive / Confirm** (`/client/orders/:id/receive`)
   - On delivered orders pending confirmation
   - Per line item: confirm qty received, enter/verify serials
   - Asset decisions: "Is this a replacement?" Y/N
     - If Y → dropdown of client's existing assets to link as replaced
   - "Who does this go to?" → dropdown of users + location field
   - Submit → creates asset rows + triggers QBO update

### Email notifications (client-facing)

Triggered events → Resend/SMTP mailer (already configured):
- **Order confirmed** — "Your order of [N items] is being prepared"
- **Shipped** — with tracking link(s)
- **Out for delivery** — if distributor provides
- **Delivered** — "Please confirm receipt and complete setup info"
- **Backorder announced** — with updated ETA if available
- Optional: weekly digest of open orders

Templates live in `src/services/email.js`, one per event type.

## Asset creation workflow (vCIO checkpoint)

After receipt + assignment:

```
Delivered → Receipt queued → [vCIO/Staff reviews]
                             ├─ Is this new, additional, or replacement?
                             ├─ If replacement: which asset is being retired?
                             ├─ Assigned to whom?
                             ├─ Confirm serial numbers
                             └─ Approve → Asset row created
                                            ↓
                               Warranty timer starts
                               Budget decremented (via existing budget module)
                               Assigned user notified
```

The vCIO is kept in the loop here because budget decisions and replacement
lifecycle judgments need human evaluation (per Jason: "this should be
presented to the vCIO and human intervention").

For client-facing receipt confirmation → same questions get asked but the
answers come from the client and the MSP team reviews/approves before asset
creation.

## Global Orders page (`/orders`)

**Top bar:**
- Search: PO#, Quote#, Opp title, distributor order ID, ship-to name, SKU,
  mfg part#
- Filters: distributor, status, client, date range, TAM, match status
- "Needs mapping" badge linking to the unmapped queue

**Columns:**
- Distributor (logo)
- Client
- Opp title (with quote# badge)
- PO #
- Distributor order #
- Order date
- Status pill
- Shipped/Received progress bar (qty shipped / qty ordered)
- Total $
- ETA / actions

**Row detail (expand or slide-over):**
- Breadcrumb: client → opp → quote
- Line items table with shipping progress, tracking links, serials
- Event timeline
- Quote vs actual cost comparison (margin)
- Actions: map/unmap, mark received, push to QBO, resend client email

## Client detail — Orders tab

Filters global view to this client, plus:

- Sub-tabs: All Orders | Opportunities | Unmapped POs (if any)
- Open backorder count on tab header
- Deep links from Opportunity → Orders under it

## Reports (Phase E or later)

- **Cycle time** — order placed → delivered, by distributor
- **Fill rate** — qty shipped / qty ordered (backorder indicator)
- **Margin** — distributor cost vs quoted price, per order and per opp
- **Distributor mix** — % of spend by distributor
- **Open backlog** — $ of un-shipped orders outstanding
- **CSV export** — for AP reconciliation against distributor invoices

## Build phases (revised with new scope)

**Phase A — Autotask sync foundation** (~2 days)
- Opportunities / Quotes / QuoteItems tables + migration
- Extend autotaskApi.js — pull Opps with po_numbers parsed as array
- Source tracking (quotewerks vs kqm vs manual)
- Simple list view at /opportunities to confirm data

**Phase B — First distributor + matcher** (~3 days)
- distributor_orders + distributor_order_items tables
- Build one adapter (recommend **Ingram Micro** as primary, then **Synnex**)
- Matcher service: PO exact → fuzzy → client name → address → unmapped
- Basic /orders page (list + filters + detail)

**Phase C — PO Mapper UI + Autotask writeback** (~1-2 days)
- Unmapped queue
- Manual mapping with suggestions
- Write PO back to Autotask Opportunity PO field (comma-appending)
- Event log

**Phase D — Additional distributors** (~1-2 days each)
- TD Synnex adapter
- Provantage adapter (pending API research)
- Amazon Business adapter (complex auth)

**Phase E — QuickBooks Online integration** (~2-3 days)
- QBO OAuth + client library
- PO read by PO number
- Receipt confirmation → QBO PO line update
- Error handling + retry UI

**Phase F — Asset creation + vCIO workflow** (~2 days)
- Receipt confirmation UI in Align (MSP side)
- "New / additional / replacement" workflow
- Tie into existing asset + budget modules

**Phase G — Customer portal** (~3-4 days)
- Auth for client contacts (magic link)
- Client dashboard, order list, detail views
- Receipt confirmation UI (client side)
- Email notification templates via Resend

**Phase H — Reports** (~2 days)

Total: ~17-22 days for everything, ~12 days for MVP (A-E) with Ingram + Synnex.

## Distributor API research — next action

Per distributor, research must answer:

1. **Hardware API access** (NOT software/SaaS) — endpoints, auth, access process
2. **Available endpoints:**
   - List orders since date (for hourly polling)
   - Get order detail (headers + line items)
   - Get tracking info (carriers, numbers, ship date, expected delivery)
   - Get serial numbers on shipped items (if exposed)
3. **Webhook support** — can they push updates vs polling?
4. **Rate limits** — per minute / per day
5. **Auth pattern** — API key, OAuth2, per-user session
6. **Partner approval process** — timeline to get production API access
7. **Sample response shapes**
8. **SDK availability**

**Will produce:** `/opt/align/docs/distributor-api-research.md` with one
section per distributor. Jason uploads any docs he already has, I fill gaps
from public info + partner portals.

## Open questions that still need answers

None blocking — requirements locked. Remaining questions will surface during
distributor API research (auth quirks, rate limits, which endpoints actually
expose what we need).

## Related modules (dependencies)

- **Autotask sync** — already exists for Companies, Contacts, Tickets. Extends
  for Opps/Quotes/Items.
- **Assets** — already exists. Hooks for order → asset creation.
- **Budget** — already exists. vCIO checkpoint decrements allocation.
- **Email** — already exists via Resend. New templates per event.
- **Client contacts** — already synced from Autotask. Adds portal-access flag.
