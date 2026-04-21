# Order Management Module — DRAFT SPEC

**Status:** Draft / requirements gathering  •  **Owner:** Jason  •  **Last updated:** 2026-04-21

## Purpose

Give the MSP team a single pane of glass for procurement: pulls Opportunities
and Quotes from Autotask (source of truth for sales) and matches them against
orders placed through hardware/software distributors. The PO number on the
Autotask Opportunity is the join key to the distributor order.

Today the workflow is fragmented — Opp created in Autotask → Quote built in
Autotask → order placed in distributor portal → status monitored in distributor
portal → delivery updates manually tracked. The goal is to collapse that into
one screen inside Align and automate status/shipment updates.

## Core user stories

1. **As a TAM / dispatcher**, I can see one list of all open orders across all
   distributors with status, ETA, and which client/opportunity they belong to.
2. **As a vCIO**, I can see the full procurement trail for a client —
   Opportunity → Quote → distributor Order → shipments → assets created — on
   the client detail page.
3. **As an MSP owner**, I can run reports on order volume by distributor,
   average order-to-delivery time, margin per order, and backorder rates.
4. **As a technician**, I can see what's shipped and arriving soon so I know
   what to expect and when to schedule deployment.

## Data model (proposed)

```
opportunities               ← pulled from Autotask (Opportunities)
  id, tenant_id, client_id, autotask_opportunity_id (unique),
  title, stage, amount, po_number,
  assigned_resource_id, expected_close, created_at, closed_at,
  metadata jsonb, last_synced_at

quotes                      ← pulled from Autotask (Quotes)
  id, opportunity_id, autotask_quote_id (unique),
  quote_number, status, amount, valid_until,
  created_at, metadata jsonb, last_synced_at

quote_items                 ← pulled from Autotask (QuoteItems)
  id, quote_id, autotask_quote_item_id (unique),
  product_sku, manufacturer, description,
  quantity, unit_cost, unit_price, line_total,
  metadata jsonb

distributor_orders          ← pulled from each distributor API
  id, tenant_id, distributor, distributor_order_id,
  po_number,                              -- the join key back to Autotask
  order_date, submitted_by,
  status, status_raw,                     -- normalized + distributor's exact text
  subtotal, tax, shipping, total,
  ship_to_name, ship_to_address jsonb,
  -- linkage (populated by matcher service)
  opportunity_id FK NULL,                 -- matched via PO
  quote_id FK NULL,
  client_id FK NULL,                      -- inferred from opportunity
  metadata jsonb, last_synced_at,
  UNIQUE (distributor, distributor_order_id)

distributor_order_items     ← line items within each order
  id, distributor_order_id, distributor_line_id,
  product_sku, manufacturer, description,
  quantity_ordered, quantity_shipped, quantity_backordered, quantity_cancelled,
  unit_cost, line_total,
  tracking_number, carrier, ship_date, expected_delivery,
  serial_numbers text[],                  -- if returned by API at ship time
  quote_item_id FK NULL,                  -- matched by SKU + Opp
  asset_id FK NULL,                       -- created in assets table on delivery
  metadata jsonb

order_events                ← audit trail
  id, distributor_order_id,
  event_type,                             -- status_change, shipment, backorder, invoice
  event_date, description, metadata jsonb, created_at
```

### Matching logic

When a new distributor order arrives, matcher service runs:

1. **Primary match:** `distributor_orders.po_number` = `opportunities.po_number`
   → fill in `opportunity_id`, `quote_id` (most recent active quote on that opp),
   `client_id`.
2. **Line item match (per order):** `distributor_order_items.product_sku` =
   `quote_items.product_sku` within the matched quote → fill `quote_item_id`.
3. **Orphan orders** (no PO match) land in a "needs attention" queue for manual
   linkage. UI provides a search/select to manually attach to an Opportunity.

## Global Orders page

Route: `/orders`

**Top bar:**
- Search box: matches PO #, quote #, opportunity title, distributor order ID,
  ship-to name, product SKU
- Filters (multi-select):
  - Distributor
  - Status (Draft / Submitted / Confirmed / Partially Shipped / Shipped /
    Delivered / Backordered / Cancelled / Returned — normalized set)
  - Client
  - Assigned TAM
  - Date range (order date)
- "Needs attention" toggle — orphan orders without an opportunity link

**Table columns:**
- Distributor (logo)
- Client name
- Opportunity title
- PO #
- Distributor order #
- Order date
- Status (color pill) + ETA if shipped
- Total $
- Actions (View detail, Link to Opp manually if orphan)

**Row expand / detail view:**
- Opportunity breadcrumb (client → opp title → quote)
- Line items grid with shipment status, tracking, SKU
- Audit timeline (order events)
- Quote comparison: quoted cost vs actual distributor cost (margin check)

## Client detail — Orders tab

Per client, filter of the global view to that client. Plus:
- Sub-tab: "Opportunities" — list of Autotask opps for this client with linked
  orders rolled up under each.
- "Open backorders" count badge on the tab header.

## Sync architecture

Each distributor gets its own sync service module, mirroring the existing
`/opt/align/src/services/` pattern (see autotaskApi.js, pax8Sync.js,
msPartnerSync.js):

```
src/services/distributors/
├── synnex.js          ← TD Synnex API adapter
├── ingram.js          ← Ingram Micro Xvantage
├── dh.js              ← D&H
├── pax8.js            ← existing — extend with order endpoints
├── arrow.js           ← Arrow Electronics (if needed)
└── index.js           ← common interface: fetchOrders(since), fetchOrder(id)
```

Each adapter normalizes to the shared `distributor_orders` schema. Runs on the
existing scheduler every N minutes. Errors log + retry with exponential backoff.

## Autotask sync

Extend the existing Autotask service. New entity pulls:
- `Opportunities` with `purchaseOrderNumber` + stage filter (active, recently closed)
- `Quotes` linked to those opportunities
- `QuoteItems` for each quote

Existing sync already pulls Companies (clients) and ConfigurationItems (assets).
This adds: Opportunities → Quotes → QuoteItems → (eventually) Invoices.

## Asset creation on delivery

When a distributor order transitions to `delivered` AND line items have
serial numbers, a hook creates rows in the `assets` table:
- Auto-fill manufacturer, model, serial, purchase date (= order date),
  warranty start (= delivery date), purchase cost (= unit_cost), client
- Tag the asset with a `procurement_reference` link back to the order line

This closes the loop: the purchase flows directly into Align's lifecycle
tracking. Warranty reminder already fires X days before expiration.

## Notifications (Phase 2)

- New order confirmed (for the TAM assigned to the opp)
- Backorder announced
- Shipment notification with tracking
- Expected delivery date within 2 days (schedule deployment)
- Delivered but not yet receipted (reminder to confirm)

## Open questions — need your input before I build

### Workflow

1. **Direction of sync:** Pull-only (Align reads orders that you already placed
   via distributor portals), or also **push-to-order** (Align submits orders
   to distributors from a Quote)? Push is 3-4× the work per distributor.
2. **Order placement trigger:** Does an Opportunity → Quote → Order flow start
   in Autotask (Quote approved → TAM manually places order in distributor
   portal → Align sees it later) or does Align become the ordering UI?
3. **Multiple orders per opportunity:** Common to split one Opp into several
   orders (some items from Synnex, others from Ingram)? Need one opp → many
   orders, yes?
4. **Quote updates after order:** If a line item gets substituted or price
   adjusts after the order is placed, do we update the Autotask Quote
   automatically or leave Autotask as-is?

### Data questions

5. **PO number uniqueness:** Is a PO number unique to one Opportunity, or can
   a PO be re-used across multiple opportunities (e.g., blanket POs)?
6. **Currency:** Any non-USD orders or is it all USD?
7. **Tax / shipping:** Pulled from distributor, or recomputed from Autotask?
8. **Serial numbers source of truth:** Distributor API (if they expose them),
   or manual entry when the box is opened?

### Distributors

9. **Priority order for integration:** Which 1-2 distributors do we build
   first? I'd suggest Pax8 (already in env, likely easiest) then Synnex based
   on volume. Your call.
10. **Which distributors total:** Full list of distributors you want
    integrated. Typical MSP set:
    - ☐ Pax8 (already have creds in .env)
    - ☐ TD Synnex
    - ☐ Ingram Micro (Xvantage)
    - ☐ D&H Distributing
    - ☐ Arrow Electronics
    - ☐ ScanSource
    - ☐ Carahsoft
    - ☐ CDW (partner portal, not true API — limited)
    - ☐ Insight
    - ☐ Other?
11. **Distributor sandbox access:** Can you get test/sandbox credentials for
    each? A lot of the distributor APIs are gated behind a partner agreement
    + approval call.

### UI / workflow

12. **Order placement workflow in Align (if we do push-to-order later):** Do
    you want approval gates (vCIO must approve orders over $X)?
13. **Customer-visible:** Does the client ever see order status (e.g., in a
    client portal) or is this internal-only?
14. **Budget linkage:** Auto-decrement the client budget as orders are placed?
    There's already a budget module — this would be a natural hookup.
15. **Alerts:** Which order events should generate a Slack/Teams/email
    notification vs just UI badges?

### Reporting

16. **KPIs you care about:** Cycle time (order → deliver), fill rate
    (ordered vs shipped), backorder rate, distributor cost variance vs quote,
    margin per opportunity. Rank these by priority.
17. **Export:** CSV export for AP reconciliation with distributor invoices?

## Distributor API research plan

For each distributor you select, I'll investigate:
1. **API type** — REST, SOAP, GraphQL
2. **Auth** — OAuth2, API key, session token
3. **Endpoints available:**
   - Place order (if push-to-order)
   - Get order by PO / ID
   - List orders since date
   - Get order detail + line items
   - Get shipment tracking
   - Pricing / stock lookup
4. **Rate limits**
5. **Webhook support** — push updates vs poll-only
6. **Partner approval process** — timeline + requirements to get API access
7. **SDK / client library availability**

### Quick survey from what I already know

**Pax8** ✅ already in `.env` as `PAX8_CLIENT_ID` / `PAX8_CLIENT_SECRET`.
REST API at `api.pax8.com`. OAuth2 client credentials. Mostly SaaS /
subscription orders (M365, etc.), not hardware.

**TD Synnex** — REST API called "SynnexConnect" (formerly SN Stream).
Requires partner approval + API key. Has order placement + tracking endpoints.

**Ingram Micro** — Moved to "Xvantage" platform in 2024. REST API.
Requires registration on their developer portal + partner approval.

**D&H** — Order Center API (REST primarily, some legacy SOAP).
Requires partner account approval.

**Arrow Electronics** — Has an API for enterprise customers, generally
requires a solutions architect engagement to set up.

## Build phases (proposed)

**Phase A — Autotask sync foundation** (~1-2 days)
- Add opportunities / quotes / quote_items tables + migrations
- Extend autotaskApi.js to pull Opportunities, Quotes, QuoteItems
- Sync service runs on existing scheduler
- Simple list view at /opportunities to confirm data

**Phase B — First distributor (Pax8 or Synnex)** (~2-3 days)
- distributor_orders + distributor_order_items tables
- First distributor adapter in `src/services/distributors/`
- Matcher service to join distributor orders to opportunities via PO
- Basic /orders page (list + filters + detail view)

**Phase C — Global Orders page v1** (~1-2 days)
- Search, all filters, detail expand
- Client detail "Orders" tab
- Orphan order queue / manual linkage UI

**Phase D — Additional distributors** (~1-2 days per distributor)
- Add adapters one by one
- Normalize quirks (status mapping, SKU formats)

**Phase E — Asset creation hook + notifications** (~1 day)
- Auto-create assets on delivery
- Email/Slack notifications for key events

**Phase F — Push-to-order** (if scoped in — 3-5 days per distributor)
- Place order via distributor API from within Align
- Approval workflow

Total: ~10-15 days for Phase A-E covering 2-3 distributors. Push-to-order
substantially more.
