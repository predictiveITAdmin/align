# predictiveIT Align — Strategic IT Alignment Platform

**URL:** `align.predictiveit.ai`
**Host:** pitai-web01 (10.168.2.46) — Node.js API + React frontend + shared PostgreSQL
**Process:** Separate PM2 process, separate database (`align`), separate nginx server block
**Target users:** vCIO, TAM, vCISO, MSP owner

---

## Core Modules

1. **Standards & Assessments** — Tech standards by category, assess clients, severity scoring
2. **Recommendations & Initiatives** — Remediation recs from misalignments, budgets, hours, priority
3. **Asset Lifecycle** — Unified asset view from 7+ APIs, warranty/EOL/refresh tracking
4. **Technology Roadmaps** — Forecasted project timelines with dependencies
5. **EOS Integration** — Rocks, Scorecard, To-Dos, Issues (custom-built, not Strety)
6. **CSAT & Client Health** — Customer Thermometer integration, satisfaction trends
7. **Report Builder** — BrightGauge replacement, templated QBR/monthly/annual deliverables, PDF export
8. **Budget Roadmaps** — Multi-year lifecycle + project + recurring cost forecasting
9. **Order Management** — Distributor order tracking, PO matching, opportunity linkage (see below)

---

## Data Sources

All 9 data sources confirmed working. Full API details in [`api-integrations.md`](./api-integrations.md).

1. ScalePad / Lifecycle Manager X — assessments, initiatives, goals, meetings
2. MyITProcess — reviews, findings, recommendations
3. Autotask PSA — assets (ConfigurationItems), contracts, companies, tickets
4. Datto RMM — live devices, warranty dates, patch/AV
5. IT Glue — configs, contacts, flexible assets, domains
6. SaaS Alerts — M365/Google licensing per user
7. Auvik — network devices (firewalls, switches, APs), topology
8. Customer Thermometer — CSAT per ticket/client
9. EOS module — custom-built (Rocks, Scorecard, To-Dos, Issues)

---

## Architecture Decisions

- Autotask Company ID is the canonical client key across all APIs
- Only sync active + customer type organizations — see [`active-customers-only.md`](./active-customers-only.md)
- Same tech stack as Resolve: Node.js backend, React frontend, PostgreSQL
- Report builder replaces BrightGauge with native templated output
- EOS built custom rather than integrating Strety beta API
- Multi-tenant MSP model with role-based access (Admin, vCIO/vCISO, TAM, Client read-only)

---

## Order Management Module

Tracks distributor orders from TD Synnex, Ingram Micro, Dell Premier, Amazon Business, and Provantage. Links orders to Autotask opportunities via PO numbers, enables full procurement visibility per client.

### Distributor Adapters

| Adapter key | Distributor | Sync Strategy | Status |
|---|---|---|---|
| `tdsynnex_esolutions` | TD Synnex | PO-driven (SOAP/XML WS-Security) | **Active** |
| `tdsynnex_ecx` | TD Synnex (legacy) | stub only | Deprecated |
| `ingram_xi` | Ingram Micro | Date-range REST (Xvantage XI) | Sandbox |
| `dell_premier` | Dell Premier | Date-range REST (OAuth2) | Pending credentials |
| `amazon_business_csv` | Amazon Business | CSV import | Active |
| `provantage_manual` | Provantage | Manual entry | Active |

### Dell Premier API Integration

Dell Premier provides a REST API for enterprise accounts to query order history.

**Authentication:** OAuth2 Client Credentials  
**Token URL:** `https://apigtwb2c.us.dell.com/auth/oauth/v2/token`  
**API Base:** `https://apigtwb2c.us.dell.com/PROD/v1`  
**Sync strategy:** `date_range` — queries `GET /orders?fromOrderDate={since}`, paginated  
**Required credentials:** Client ID, Client Secret (from Dell Premier portal)  
**Optional:** Customer account number (to filter orders by account)

To activate: configure via Settings → Suppliers → Add Supplier → "Dell Premier". Contact Dell account team or Premier portal to obtain API credentials.

### PO-Driven Sync (TD Synnex)

TD Synnex eSolutions has no "list all orders" endpoint. The sync driver:
1. Queries local `opportunities` table for all POs from **Closed/Implemented** opportunities
2. **Excludes opportunities where `category = 'Monthly Recurring Revenue'`** — MRR contracts are subscription-based and never have distributor POs
3. Calls `getPOStatus(poNo)` for each PO via SOAP
4. Upserts results into `distributor_orders` + runs the order matcher

### Default Date Range

Order sync defaults to `2021-01-01` as the earliest `from_date` when no `last_sync_at` exists. This ensures all historical orders since 2021 are captured on first sync. On subsequent runs, the adapter uses `last_sync_at` as the incremental cursor.

### Order Statuses

`submitted` → `confirmed` → `partially_shipped` → `shipped` → `delivered`
Also: `backordered`, `out_for_delivery`, `exception`, `cancelled`, `returned`

### Default View: Open Orders

The `/api/orders` endpoint defaults to `open_only=1` — returning only orders that are **not** `delivered` or `cancelled`. This shows the active pipeline of in-flight orders.
- Pass `open_only=0` to load full history (all statuses, from 2021-01-01)
- Frontend toggle: "Open Orders" (default) / "All History"

### PO Matching Pipeline

Auto-matches orders to opportunities via cascade:
1. **PO exact match** (confidence 100) — `order.po_number IN opportunity.po_numbers[]`
2. **PO fuzzy match** (confidence 80) — normalized (strip prefix, uppercase)
3. **Client name match** (confidence 60) — `ship_to_name` vs client name (≥70% word overlap)

Unmatched orders (`match_status = 'unmapped'`) can be manually mapped via the PO Mapper UI. On manual match:
- Order is linked to the opportunity
- The PO number is **written back to Autotask** via `PATCH /Opportunities/{id}` (UDF: "Purchase Order Number")
- Local `opportunities.po_numbers[]` is updated

### MRR Category Rule

Only opportunities with `category != 'Monthly Recurring Revenue'` participate in PO matching. Recurring-revenue contracts (O365, managed services agreements, etc.) are billed by subscription and will never generate a distributor PO. This filter applies both to the PO-number collection query and is surfaced in the UI as `opportunity_category` on order rows.

---

## Why This Exists

Key differentiator for predictiveIT's MSP practice — replaces ScalePad LMX + MyITProcess + BrightGauge with a unified platform.

All architecture decisions should optimize for TAM/vCIO workflow efficiency. Every module should tie back to client-facing deliverables (QBR reports, roadmap PDFs, budget presentations).
