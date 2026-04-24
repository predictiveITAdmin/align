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

## 2026-04-24 — Orders QA widgets + part-overlap SKU filter + Resolve auth nav

**Orders Page: QA — Auto-Map Health widgets**

Two new tiles under the existing stats row, visible only when count > 0:

- **PO Not Written to AT** — orders auto-mapped to an opportunity whose PO
  number was never pushed to `opportunities.po_numbers[]` in Autotask. Covers
  the gap where non-exact matches (`po_fuzzy`, `part_overlap`, `client_name`)
  skip writeback. Per-row **"Write PO to AT"** fix button triggers
  `POST /api/orders/qa/write-po/:id` which invokes
  `opportunitiesSync.appendPoToAutotask()`.
- **Multi-Distributor Opps** — opportunities with orders from 2+ distinct
  distributors. Full reconciliation table with:
  - Actual Total (sum of all linked distributor orders)
  - Expected Product Cost (from quote line items, **excluding** service/shipping)
  - Variance (Actual − Expected, color-coded ≤$100 green, ≤$1k amber, >$1k red)
  - Service Revenue Excluded column — shows what was filtered out
  - Per-opp distributor chips + click-through to opp slide-over

**New endpoints:**
```
GET  /api/orders/qa/pos-not-written      — list of orders missing AT PO writeback
GET  /api/orders/qa/multi-distributor    — opps + reconciliation per distributor
GET  /api/orders/qa/stats                — counts for the two tiles
POST /api/orders/qa/write-po/:id         — fix action: push PO to AT
```

**Part-overlap SKU filter (`orderMatcher.js`)**

`getMatchSuggestions()` part-overlap strategy now excludes internal service
and shipping SKUs from both the match count and the denominator. Without
this, a quote containing `Labor-Standard` + `Cabling-Project-Resale` could
falsely match an unrelated distributor order just because labor lines
appear on many quotes. Pattern:
```
^(labor|smart-labor|cabling|installation|install|shipping|freight)[-\s]?
| ^(shipping & handling)$
```
Case-insensitive on `LOWER(TRIM(description))`. Exported as
`INTERNAL_SKU_REGEX` and reused by the multi-distributor reconciliation
query to compute Expected Product Cost.

**Phase 4: Response modes on standards**

Imported 1,387 MyITProcess standards were initially generated with 5-level
maturity rubrics. A topic-aware classifier reclassified them:
- **binary** (1,247) — Compliant / Non-Compliant / NA (3 responses)
- **ternary** (29) — Yes / Partial / No / NA (4 responses)
- **graded** (95) — full 5-level maturity (Satisfactory → At Risk + NA)
- **informational** (8) — Documented / NA (2 responses, data-intake questions)

Total `standard_responses` went from 6,935 → 4,376 (−37%). Schema added:
```
ALTER TABLE standards ADD COLUMN response_mode text DEFAULT 'graded';
```
Classifier heuristics in `/tmp/standards_import/05_classify_binary.py` —
keys on multi-question count, list/checklist patterns, graded coverage
language, and specific question-start phrases.

The existing 5-pill response renderer in `AssessmentDetail.jsx`
automatically renders 3 pills for binary standards (green Compliant /
red Non-Compliant / gray N/A) — no UI branch required. Binary questions
feel like yes/no toggles.

**Phase 4: Framework Gap Assessment (`assessment_type='framework_gap'`)**

New assessment type pulls only standards with a matching
`standard_framework_tags.framework` entry. Picker in the New Assessment
modal lists all configured frameworks with control counts (CMMC-L2,
ISO-27001-2022, PCI-DSS-4, HIPAA, NIST-800-171-R2, NIST-CSF-2, CMMC-L1).
Metadata `{framework: 'CMMC-L2'}` stored on the assessment row.

New endpoint: `GET /api/assessments/frameworks` — per-framework counts.

**Phase 4: Answer inheritance**

On assessment creation (any type), `assessment_items.response_id` is
pre-filled from the most recent response for `(client_id, standard_id)`
across any prior assessment. Metadata records
`inherited_from_assessment_id`. UI shows violet "↩ Inherited" badge and
a banner in the notes panel citing the source assessment. Selecting a
new response overrides it for the current assessment only (other
assessments unchanged).

**Phase 4: Evidence examples**

Added `standards.evidence_examples text[]` column, populated during
import for all framework-tagged standards using topic-matched templates
(e.g. encryption → "Screenshot of BitLocker/FileVault encryption status
across endpoints"; MFA → "Entra ID Conditional Access policies"). Shown
in the assessment conduct UI when a standard's detail panel is expanded.

**Phase 4: Cross-framework badges on standards**

Each assessment item now displays all framework tags associated with its
standard (e.g. one MFA control can show CMMC-L2 IA.L2-3.5.3 + NIST-800-171
3.5.3 + ISO A.5.17 + PCI-DSS 8.4). Renders as small pill badges under the
item title.

**Phase 4: Bulk approve drafts**

New `POST /api/standards/bulk-approve` endpoint (requires tenant_admin
or vcio or global_admin). Accepts `{ section_id }` to approve every
draft in a given section, `{ ids: [...] }` for explicit lists, or no
filter to approve all drafts in the tenant. Sets `status='approved'`
and `last_reviewed_at=NOW()`. Only rows currently at `status='draft'`
are updated (no-op on already-approved).

UI: the Standards page shows a green **"Approve N Drafts"** button next
to the existing "Add Standard" action whenever the current scope (the
selected section, or selected category, or all standards) contains any
drafts. Scope-aware count; confirm dialog before firing. Lives in
`client/src/pages/Standards.jsx` alongside the toolbar.

Unblocks the 1,379 MyITProcess drafts waiting for approval. Recommended
order: CMMC L1/L2 → PCI-DSS → NIST 800-171 → NIST CSF → ISO 27001 →
HIPAA → operational sections (Server Infra, Hardware, etc.). See
`docs/phase-4-assessments.md#bulk-approve-drafts-shipped-2026-04-24`.

**Infrastructure: pm2-logrotate installed**

`pm2.log` had grown to 11 GB from years of unrotated daemon events
(restart churn, app crashes). `/home/pitadmin/.pm2/logs/pg-cleanup-out.log`
was also 652 MB from an orphaned PM2 process that had been removed but
whose log file persisted. Root cause of 2026-04-23 disk-full incident
that crashed PM2 and caused the M365 SSO button to disappear (MSAL client
initialization requires env vars which were lost on crash-restart).

Installed `pm2-logrotate` module with config:
```
max_size: 50M
retain: 7
compress: true
workerInterval: 60 (seconds)
rotateInterval: 0 0 * * * (daily at midnight)
rotateModule: true (rotate logrotate's own output too)
```
Truncated the two offenders. Reclaimed 11.6 GB.

**Resolve: Global admin sees tenant settings nav**

`/opt/resolve/client/src/shells/SettingsShell.jsx` — when user is
`global_admin`, sidebar now prepends the Global Admin nav groups
(Tenants, Email, API Keys, Health, Call Logs, Feedback) above the tenant
settings groups. Symmetric change to `AdminShell.jsx` adds tenant
settings section. Global admins can now freely navigate between shells
without URL typing. Tenant admins unchanged.

---

## 2026-04-23 — Order Management: richer order card + predictive PO mapping

**Order detail card (`OrderDetailSlideOver`)**

- **Created timestamp** now shown alongside the distributor's Order Date (uses
  `distributor_orders.created_at` — the row-insert time from sync, which helps
  diagnose sync lag vs. distributor-reported order date).
- **Full ship-to address block** rendered from the existing `ship_to_address`
  JSONB (line1/line2/city/state/postal/country) — was previously showing only
  `ship_to_name`.
- **Line item descriptions** no longer truncated; `break-words` + `whitespace-pre-wrap`.
  `item.metadata.long_description` surfaced underneath the short description
  when the adapter provides it (Ingram Micro does; TD Synnex eSolutions WSDL
  only returns `productShortDescription`, so no long_description there).
- **Tracking numbers are now clickable** links to carrier sites (UPS / FedEx /
  USPS / DHL / OnTrac), with a Google-search fallback for unknown carriers.
  When an adapter emits `item.metadata.tracking_numbers[]` (multi-shipment
  support), every package is rendered; falls back to the single
  `tracking_number` column otherwise.

**Adapters — multi-tracking metadata (no schema change required)**

- `tdsynnex_esolutions.js`: now stores the full `packages[].trackingNumber[]`
  list into `item.metadata.tracking_numbers`. Previously only the first was
  kept in the scalar `tracking_number` column.
- `ingram_xi.js`: now stores full `shipmentDetails[].trackingNumber[]` into
  `item.metadata.tracking_numbers` and maps `l.longDescription ||
  l.productDescription` into `item.metadata.long_description`.
- Rationale: avoids a migration for a rarely-used column while unlocking
  multi-package tracking UI today. If adoption is high we can promote to a
  first-class `tracking_numbers text[]` column later.

**Predictive PO Mapper (`orderMatcher.getMatchSuggestions` + UI)**

Replaced the old "search box + auto-match dry-run" with a 5-strategy
predictive list, each row carrying `match_method`, human `match_reason`,
and a `confidence` score. The UI groups by method into collapsible
sections, so the user sees *why* each suggestion was picked.

Strategies (priority order):

1. **po_exact** (conf 100) — `order.po_number ∈ opp.po_numbers[]`
2. **po_fuzzy** (conf 80)  — normalized PO equality (strip `PO-`, `#`, spaces)
3. **part_overlap** (conf 50–90) — joins `distributor_order_items.mfg_part_number`
   against `quote_items.mfg_part_number`; confidence scales with the ratio
   `matched_count / total_order_parts`. Returns `matched_parts[]` for display.
4. **date_proximity** (conf 30–70) — closed opportunities where
   `opp.closed_date` is within ±30 days of `order.order_date`; confidence
   decays linearly with day-distance. Reason line shows "Closed N days
   before/after order date".
5. **client_name** (conf 30–60) — ship_to_name fuzzy-matches a client, then
   returns that client's recent opps (up to 6).

**Search box** now covers `opp.title`, `client.name`, `opp.po_numbers[]`,
`quote.title`, and `quote.quote_number` (so typing a quote # finds the linked
opp). In search mode, the predictive groups are hidden and only search
results render — keeps the UI focused.

**API shape change** — `GET /api/orders/:id/match-suggestions` now returns
richer rows (still a flat array, backward-compatible). New fields per row:
`match_method`, `match_reason`, `confidence`, `closed_date`, `created_date`,
`expected_close`, and for `part_overlap` rows: `matched_parts[]`,
`match_count`, `total_parts`. Front-end groups by `match_method`.

---

## 2026-04-22 — UI: OppDetail + OrderDetail slide-overs extracted; ClientDetail row-click bug fix; search depth

- **OppDetailSlideOver extracted** to `client/src/components/OppDetailSlideOver.jsx` — reusable
  component (props: `oppId`, `onClose`). Removed 130-line inline `OppDetail` function from
  `Opportunities.jsx`; replaced with import.
- **OrderDetailSlideOver extracted** to `client/src/components/OrderDetailSlideOver.jsx` — includes
  POMapperModal, all status helpers. `Orders.jsx` now imports instead of inlining.
- **ClientDetail Opportunities tab — row click bug fixed** — rows had no `onClick` handler; added
  `selectedOppId` state, cursor-pointer styling, and renders `<OppDetailSlideOver>`. Also added
  inline search box filtering by title/stage/owner/PO.
- **ClientDetail Orders tab — row click bug fixed** — same pattern: `selectedOrderId` state +
  `<OrderDetailSlideOver>` with `onRefresh` callback.
- **Backend search extended** — `GET /api/opportunities?search=` now matches: `o.title`,
  `c.name`, `o.po_numbers[]` (array unnest), linked `qt.title`, `qt.quote_number::text`.
  Enables "11628" → finds "PH - Linda PC (#PITQ11628)" and all linked quotes.

## 2026-04-22 — Ingram Micro: form labels corrected; Secret Key field added

- **REQUIRED_FIELDS labels corrected** in `src/services/distributors/ingram_xi.js` to match
  the Ingram developer portal exactly: "Consumer Key" → **"Client ID"**, "Consumer Secret" →
  **"Client Secret"**. Help text updated to reference exact portal locations.
- **Secret Key field added** — new `webhook_secret` field (label: "Secret Key") for webhook
  signature verification. Matches the "Secret Key" shown in the Ingram portal app detail page.
- **API_VERSION set to `v6`** — "Order Management v6" product (list/search endpoint
  `GET /resellers/v6/orders/ordersearch`) is the correct product for order sync. "Async Order
  Management v7" is single-order lookup only (requires `orderNumber`; no list capability).
  Adapter now defaults to v6 with automatic fallback probe to v6.1 on 401.

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
