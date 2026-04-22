# CHANGELOG

Chronological log of meaningful changes per module. Not a commit log — a
**decision log** for the developer porting this to production.

Format:
```
## YYYY-MM-DD — Module name

- Short description of change, with WHY
- Rationale for any tradeoff
- Link to ADR if architectural
```

Skip trivial fixes, typos, and tiny tweaks. Only log changes that affect
behavior, schema, API contracts, or would change how the developer
implements it.

---

## 2026-04-22 — Opportunities UI: filters, columns, detail card

Major overhaul of the `/opportunities` global page and detail slide-over:

- **New columns:** Owner (resolved to full name from AT Resources API), Category,
  Created Date, Closed Date (only shown when not filtering to open-only)
- **Multi-select client filter:** checkbox dropdown — select one or many clients;
  replaces the old single-value text search
- **Multi-select owner filter:** same pattern — filter by one or many resource names
- **Date range filters (all three date fields):** presets (This Week / Last Week /
  This Month / Last Month / Next Month) + custom from/to date inputs with calendar
  picker. Applies to: Close Date (projected close), Create Date, Closed Date
- **Active filter chips:** each active filter shows a removable chip with ×; "Clear
  all" resets everything
- **Enhanced OppDetail slide-over:** expanded from 4 to 8 fields — Stage, Amount,
  Owner, Category, Close Date (projected), Create Date, Closed Date, PO Numbers
- **`assigned_resource_name TEXT` column** added to `opportunities` table via server
  startup migration (ADD COLUMN IF NOT EXISTS). Populated during sync from
  AT Resources API lookup.

## 2026-04-22 — Opportunity sync: pagination fix, batch quotes, incremental items

Four significant reliability + performance improvements to `opportunitiesSync.js`:

- **Fix AT pagination 405-retry loop:** When AT returned HTTP 405 on a GET
  continuation page, the retry was POSTing to the base `/Quotes/query` endpoint
  (no cursor), always returning page 1 and looping forever. Fix: retry posts to
  `nextUrl` directly which contains the page cursor. Affected all paginated AT
  queries; caused incomplete syncs silently.
- **Batch `syncQuotes`:** Previously made one AT API call per opportunity (2,271+
  calls, ~30+ min). Rewritten as a single paginated batch query with
  `opportunityID > 0` + optional `lastActivityDate ≥ since` filter, then matches
  quotes to opportunities in memory. Result: 2 pages, ~30 sec, 952 quotes.
- **Incremental `syncQuoteItems`:** Scheduled runs now only re-fetch items for
  quotes updated in the last 4 hours (`q.last_synced_at > NOW() - '4 hours'`).
  Full pull (forceSince) fetches items for all quotes. Prevents ~972-call storm
  on every hourly tick.
- **`forceSince` parameter:** New parameter on `syncOpportunities`, `syncQuotes`,
  `syncQuoteItems`, and `syncAll`. When set, bypasses the DB-computed
  `MAX(last_synced_at)` cursor so a manual full-pull isn't blocked by the
  scheduler auto-running and resetting the cursor mid-operation.
- **AT Resources lookup:** Before the main opp loop, fetches `GET /Resources`
  to build a `{ resourceId → 'First Last' }` map. Stores the resolved name in
  `opportunities.assigned_resource_name` so the UI can display the owner name
  without a secondary lookup.

## 2026-04-22 — Dell Premier distributor adapter

New adapter: `src/services/distributors/dell_premier.js`

- **Auth:** OAuth2 Client Credentials — token URL
  `https://apigtwb2c.us.dell.com/auth/oauth/v2/token`, cached with 5-min
  safety buffer before expiry
- **Sync strategy:** `date_range` — `GET /orders?fromOrderDate={since}` paginated
- **Status normalization:** deliver→delivered, ship→shipped, cancel→cancelled,
  hold→exception, acknowledg→confirmed
- **Required fields:** `client_id`, `client_secret` (optional: `account_number`)
- Registered in `distributors/index.js` under key `dell_premier`
- Status: pending production credentials from Dell account team / Premier portal

## 2026-04-22 — Distributor sync: fix sync_mode filter

`syncAllSuppliers` queried `sync_mode = 'api'` but suppliers configured via the
admin UI default to `sync_mode = 'scheduled'`. TD Synnex eSolutions was therefore
never picked up by the hourly scheduler. Fixed to `sync_mode IN ('api', 'scheduled')`.

## 2026-04-22 — TD Synnex eSolutions adapter active

`tdsynnex_esolutions` adapter now operational:

- SOAP/XML over HTTPS with WS-Security UsernameToken auth
- PO-driven sync (no list endpoint): queries local opportunities for all
  PO numbers from Closed/Implemented non-MRR opportunities, calls
  `getPOStatus(poNo)` per PO, upserts results
- Stage-based won/lost classification: stages 7–14 = won, 15 = lost, 66 = junk
  (excluded entirely from sync), overrides AT `status` field for legacy data
  where reps skipped the Close wizard
- MRR exclusion: `category NOT ILIKE '%Monthly Recurring Revenue%'` — recurring
  contracts never have distributor POs
- First run seeded with 722 PO numbers from closed-won non-MRR opportunities

## 2026-04-21 — Order Management Phase A backend shipped

Complete backend scaffolding for Order Management module, ready for frontend work:

- Migration `src/migrations/order_management_001.sql` — 9 new tables:
  opportunities, quotes, quote_items, suppliers, distributor_orders,
  distributor_order_items, order_events, order_receipts, order_item_assignments.
  pgcrypto extension enabled for credential encryption.
- `src/services/opportunitiesSync.js` — pulls Autotask Opportunities,
  Quotes, QuoteItems. Parses PO text field to array (ADR-003).
  Exports `appendPoToAutotask()` for PO Mapper writeback.
- `src/services/supplierCrypto.js` — AES-256-GCM encryption for
  supplier credentials (ALIGN_ENCRYPTION_KEY env var, falls back to
  derived from JWT_SECRET for dev).
- `src/services/distributors/` — adapter framework with common
  interface (testConnection, fetchOrders, fetchOrder, handleWebhook,
  requiredFields schema). Normalized order shape and status enum
  (constants.js) shared across adapters.
  - `ingram_xi.js` — LIVE implementation (OAuth2, paginated orders,
    webhook handler, status normalization). Pending valid creds to test.
  - `tdsynnex_ecx.js` — stub, awaiting API registration
  - `amazon_business_csv.js` — CSV parser for Shipments report
  - `provantage_manual.js` — manual-entry mode only
- `src/routes/opportunities.js` — /api/opportunities (list, detail,
  sync trigger, sync status)
- `src/routes/suppliers.js` — /api/suppliers (list adapters, CRUD,
  test connection with masked secrets)
- `src/routes/orders.js` — /api/orders (list, stats, detail, map/unmap
  with Autotask PO writeback)

Encryption key recommendation: set `ALIGN_ENCRYPTION_KEY=<64 hex chars>`
in `.env` for production (dev falls back to JWT_SECRET-derived key).

## 2026-04-21 — Supplier API Admin module added to Order Mgmt spec

- New "Supplier API" module under the Admin tab. Per-tenant distributor
  configuration UI with encrypted credentials, sync settings, and a
  "Test Connection" button.
- Schema: `suppliers` table — adapter_key, credentials jsonb (encrypted),
  sync mode/frequency, webhook URL + secret, last test/sync status.
- Generic adapter interface (`DistributorAdapter` base class) — each
  distributor implements testConnection/fetchOrders/fetchOrder/handleWebhook.
  Admin UI renders form fields dynamically from `requiredFields` schema.
- CSV import mode for distributors without APIs (Amazon Business v1,
  Provantage fallback).
- Encrypted credentials storage (pgcrypto or app-level), masked in UI
  except during edit, rotation reminders at 90 days.
- Enables future distributors to ship as an adapter module + registry
  entry, no UI code changes needed.

## 2026-04-21 — Distributor API research

- Added `docs/distributor-api-research.md` with complete findings and
  action plan per distributor.
- **Verdict:** Ingram Micro Xvantage is the cleanest API and should be
  built first. OpenAPI spec + Node SDK + webhooks + 2-day approval.
- TD Synnex is workable but needs email to `helpdeskus@tdsynnex.com`
  for API registration. Two platforms — use ECExpress/Digital Bridge
  for HARDWARE, skip StreamOne ION (software only).
- Amazon Business has 4-6 week onboarding lead — needs to start now
  if we want it in the MVP timeline. Alternative: manual CSV import.
- Provantage has NO public API. Needs direct partner outreach or we
  handle manually in v1.
- QuickBooks Online has clean OAuth2 + native Node SDK, can start QBO
  integration as soon as Intuit dev account is created.
- Jason's action list (~30-45 min total): sign up developer portals +
  send helpdesk email + decide Amazon path + contact Provantage rep.

## 2026-04-21 — Order Management (new module)

- **NEW module spec.** Requirements locked. `docs/order-management-spec.md`.
- Scope narrowed to **hardware distributors only** (Ingram Micro, TD
  Synnex, Provantage, Amazon Business). Pax8 explicitly out — software
  subscriptions are a separate concern.
- PO field on Autotask Opportunity is **comma-separated array** of POs
  (one Opp can span multiple distributors). Parse as array, not string.
- **Manual PO Mapper** is required — auto-match won't catch all orders.
  Unmapped orders queue → user picks the right Opp → Align **writes the
  PO back to Autotask** (appends to the PO field comma-separated).
- QuickBooks Online integration is **bidirectional**: Align reads QBO
  POs to show PO status, and writes received-quantities on delivery
  confirmation so AP can reconcile bills.
- **Customer-facing portal** required: clients get order status emails,
  dashboard, receipt confirmation, and answer questions (replacement?
  assign to whom?) via their client contact login.
- Sync cadence: **hourly** scan of all distributors.

## 2026-04-21 — Documentation system

- Docs reorg: each module gets its own spec under `docs/`, master
  `product-spec.md` stays strategic only, new `docs/README.md` is the
  index, new `docs/adr/` for Architecture Decision Records, new
  `docs/for-developers.md` for porting guidance, new `CHANGELOG.md`
  (this file).
- `CLAUDE.md` now has **Current Focus** and **Parked Items** sections
  so every Claude Code session lands with context on what's active.
- Convention: specs are **updated as we iterate**, not written once
  and left stale. Spec is the final intent; code is the reference
  implementation.

## 2026-04-21 — Standards & Assessments (Phase 4)

- **1,387 master standards imported** from MyITProcess XLSX as drafts.
  Pipeline preserved in `scripts/standards_import/`.
- Added `response_mode` enum on standards: **binary / ternary / graded
  / informational**. 90% of imports are binary (Yes/No/NA) — reduces
  scoring complexity from 6,935 → 4,376 responses.
- **Cross-framework merges** executed: single master control can carry
  multiple framework tags. Example: "Incident response plan documented"
  has tags for HIPAA, ISO-27001-2022 A.5.24, NIST-800-171 3.6.1,
  PCI-DSS 12.10.1 — answering it once satisfies all four frameworks.
- New assessment type: **`framework_gap`** with `framework` metadata.
  Pulls standards by framework tag, not by client_standards applicability.
- **Answer inheritance**: when creating a new assessment, the latest
  answer from any prior assessment for that client auto-populates.
  Badge "↩ Inherited" shown in UI; user can override per standard.
- Per-client **review cadence** setting (monthly/quarterly/semi_annual/
  annual). Drives recurring review assessment scheduling.
- **Onboarding Phase 1 / Phase 2** assessment types: Phase 1 = high
  priority standards only, Phase 2 = remaining.
- `standards.evidence_examples text[]` added for compliance-tagged
  controls (e.g., "Screenshot of Entra ID CA policies", "Autotask
  ticket with patch deployment evidence").
- `standard_framework_tags.framework_evidence text` added for
  framework-specific evidence hints.
- Unique constraints: `(tenant_id, name)` on standard_sections;
  `(tenant_id, section_id, name)` on standard_categories; `(standard_id,
  framework)` on standard_framework_tags.

## 2026-04-21 — Infrastructure recovery

- pitai-app01 root filesystem hit 97% full — all subprocess creation
  failed (Claude Code bash tool + npm + pm2). VMware disk expanded
  50→250GB, LVM + ext4 resized. Reclaimed 24GB of unallocated LVM
  space as bonus. Final: 213GB free.
- Both apps restarted under PM2. Microsoft auth restored.
- All Phase 4 work committed + pushed to GitHub (`ddca220`).
- Memory folder cleaned up: project-specific docs moved out of
  `~/.claude/projects/.../memory/` and into each repo's `docs/`.
  User-level memory only going forward.

## Earlier — Pre-Phase-4

See git history and each module's spec for earlier changes.
