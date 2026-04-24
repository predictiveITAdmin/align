# predictiveIT Align — Feature Roadmap

Items are organized by stage: **Planned → In Progress → Done**

---

## 🗓️ Planned

### SaaS Licensing & Reconciliation

#### Global SaaS Licenses Page — Client Filtering & Expiration Management
**Priority:** High
**Est. Effort:** Low (1–2 days) — builds on top of Pax8 + MS Partner data

A dedicated **Global Licenses** page (top-level nav) that aggregates all subscription and license data across every client, with full filtering and expiration alerting.

**Client filtering:**
- Filter dropdown (or multi-select) to scope the view to one or more clients
- "All Clients" default — rolls up total seat count, total MRR/ARR, total subscriptions
- Quick-search by client name, product name, or vendor
- Column-sortable table: Client | Product | Vendor | Seats | Cost | Renewal Date | Status

**Subscription date / expiration management:**
- Renewal date column with color-coded badges: green (> 90 days), amber (30–90 days), red (< 30 days), grey (no date)
- Filter tabs: All | Renewing This Month | Expiring in 30 Days | Expiring in 90 Days | Expired
- Expiration calendar view: month grid showing which subscriptions renew on which day — click a date to see details
- Bulk actions: export expiring subscriptions to CSV for client renewal conversations
- Alert flag: subscriptions with `status = suspended` or `status = cancelled` surfaced at top as action items

**Cost summary bar:**
- Total MRR across filtered clients
- Total ARR
- Seat count rollup
- Breakdown by vendor (Microsoft vs. other)

**DB additions needed:**
- No new tables — reads from `pax8_subscriptions` and `ms_partner_licenses`
- Optional: `saas_license_alerts` table for snoozing/acknowledging expiration alerts: `(id, tenant_id, subscription_id, source, snoozed_until, acknowledged_at, notes)`

**UI additions:**
- `/licenses` route — Global Licenses page with client filter, expiration tabs, calendar toggle
- Client detail SaaS tab: same filter/expiry UI scoped to that client only
- Dashboard widget: "Subscriptions Expiring Soon" — top 5 upcoming renewals with client name + days remaining

---

#### Pax8 Integration — Subscription & License Management
**Priority:** High
**Est. Effort:** Medium (3–5 days)

Pull subscription and licensing data from Pax8 to give per-client visibility into:
- What subscriptions are active (product name, SKU, vendor)
- Total licensed seats purchased through Pax8
- Monthly/annual cost per subscription
- Renewal dates and subscription status (active, suspended, cancelled)
- Cross-reference against actual usage from Microsoft 365 / SaaS Alerts to surface over- or under-licensing

**Pax8 API:**
- REST API: `https://api.pax8.com/v1/`
- Auth: OAuth 2.0 client_credentials (`https://login.pax8.com/oauth/token`)
- Key endpoints: `GET /companies`, `GET /subscriptions`, `GET /products`
- Customer matching: match Pax8 company name/domain → Align client via fuzzy match + Autotask company ID

**DB additions needed:**
- `pax8_subscriptions` table: `(id, tenant_id, client_id, pax8_company_id, pax8_subscription_id, product_name, vendor, sku, status, quantity, unit_price, billing_term, commitment_term, start_date, renewal_date, metadata, last_synced_at)`
- `pax8_company_id` column on `clients` table for mapping

**UI additions:**
- SaaS Licenses tab (client detail): add "Subscriptions" sub-tab showing Pax8 data alongside SaaS Alerts usage
- Reconciliation view: side-by-side purchased (Pax8) vs. assigned (Microsoft/SaaS Alerts) per product — highlight gaps
- Global Licenses page: cross-client subscription rollup, cost summary, renewal calendar

---

#### Microsoft Partner Center Integration — License Reconciliation
**Priority:** High
**Est. Effort:** Low–Medium (2–3 days) — credentials likely already usable

> **Short answer: Yes, we can start with this before Pax8.**

The existing Microsoft Azure app registration (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` in `.env`) can be extended to call the **Microsoft Partner Center API** if predictiveIT is enrolled as a Cloud Solution Provider (CSP). This gives us cross-tenant license data for all managed Microsoft customers without per-customer consent flows.

**What Partner Center API gives us:**
- All CSP customer tenants linked to predictiveIT's partner account
- Per-customer subscriptions: M365 Business Premium, E3, Intune, Defender, etc.
- Seat counts: total licensed, assigned (consumed), unassigned (available)
- Subscription status, renewal date, commitment term

**Auth approach:**
- Scope: `https://api.partnercenter.microsoft.com/.default`
- Same client credentials flow as existing MS SSO app — **Resolve already has `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` configured and Align inherits the same values**
- Only new addition needed: add `MS_PARTNER_SCOPE` to `.env` + grant "Partner Center" API permission on the existing Azure app registration
- **Requires:** The Azure app registration must have the `Partner Center` API permission added in Azure Portal, OR use the Partner Center's own app (created at `https://partner.microsoft.com/en-us/dashboard/account/v3/apps/api/new`)
- Full setup guide available in app: **Settings → Integration Setup → Microsoft 365 & Partner Center**

**Key API endpoints:**
```
GET https://api.partnercenter.microsoft.com/v1/customers
GET https://api.partnercenter.microsoft.com/v1/customers/{customerId}/subscriptions
GET https://api.partnercenter.microsoft.com/v1/customers/{customerId}/subscribedskus
```

**`subscribedskus` returns per-SKU:**
- `skuPartNumber` (e.g. `SPB`, `ENTERPRISEPACK`)
- `prepaidUnits.enabled` — total licensed seats
- `consumedUnits` — assigned seats
- `prepaidUnits.enabled - consumedUnits` = **unassigned seats**

**DB additions needed:**
- `ms_partner_licenses` table: `(id, tenant_id, client_id, ms_customer_tenant_id, sku_id, sku_part_number, product_name, total_units, consumed_units, available_units, applies_to, capability_status, last_synced_at)`
- `ms_partner_customer_id` column on `clients` table for mapping

**Implementation plan:**
1. Add `MS_PARTNER_SCOPE=https://api.partnercenter.microsoft.com/.default` to `.env`
2. Create `src/services/msPartnerSync.js` — auth + customer fetch + SKU sync
3. Add `POST /api/sync/ms-partner` route
4. New table migration
5. Surface data in SaaS Licenses tab alongside SaaS Alerts data
6. Add reconciliation column: Pax8 purchased vs. Partner Center assigned vs. SaaS Alerts active

---

#### Google Workspace Integration — License & User Directory
**Priority:** Medium
**Est. Effort:** Medium (3–4 days)

Pull Google Workspace user counts and license assignments per managed customer to surface alongside Microsoft 365 data in the SaaS Licenses module.

**What it gives us:**
- Total users per Google Workspace customer
- Active vs. suspended users
- License assignments per SKU (Business Starter, Business Standard, Business Plus, Enterprise, etc.)
- Per-user product assignment (who has Drive, Meet, Vault, etc.)

**Auth approach:**
- Google Service Account with domain-wide delegation (server-to-server, no per-user consent)
- Scopes: `admin.directory.user.readonly`, `admin.directory.domain.readonly`, `apps.licensing`
- Each managed customer needs to grant DWD OR predictiveIT must be a Google Reseller (Reseller API available)
- New env vars: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON, minified), `GOOGLE_ADMIN_EMAIL`
- **Resolve already has `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** for portal OAuth — the service account is separate and purpose-built for directory reads
- Full setup guide available in app: **Settings → Integration Setup → Google Workspace**

**Key API endpoints:**
```
GET /admin/directory/v1/users?customer={customerId}    → user list
GET /admin/directory/v1/customer/{id}                  → domain info
GET /apps/licensing/v1/product/{sku}/sku/{sku}/users   → license assignments
```

**DB additions needed:**
- `google_workspace_licenses` table: `(id, tenant_id, client_id, google_customer_id, sku_id, product_name, sku_name, total_units, assigned_units, available_units, last_synced_at)`
- `google_customer_id` column on `clients` table (format: `C04abc123`)

**Implementation plan:**
1. Add service account env vars to `.env`
2. Create `src/services/googleWorkspaceSync.js` — auth via JWT + DWD + user/license fetch
3. Add `POST /api/sync/google-workspace` route
4. New table migration
5. Surface in SaaS Licenses tab: Google column alongside Microsoft + Pax8

---

### Vendor Warranty Integration

#### SonicWall, Fortinet & WatchGuard — Warranty & Support Status
**Priority:** Medium
**Est. Effort:** Medium (3–5 days)

Pull warranty and support contract data directly from vendor portals/APIs to surface per-device coverage status inside the Assets view — eliminating manual warranty lookups.

**SonicWall**
- Portal: `https://www.mysonicwall.com`
- API: MySonicWall Partner API (`https://api.mysonicwall.com`) — requires partner/reseller credentials
- Auth: OAuth 2.0 or API key depending on partner tier
- Key data: serial number lookup → product name, registration date, support contract expiry, contract SKU (TotalSecure, EPSS, APSS, etc.)
- Match by: asset `serial_number` → SonicWall registration record

**Fortinet**
- Portal: `https://support.fortinet.com`
- API: FortiCare REST API (`https://support.fortinet.com/ES/api/v1/`)
- Auth: API token (generated in FortiCare portal under Partner account)
- Key endpoint: `POST /products/list` with serial numbers → returns contract type, expiry, SKU
- Key data: hardware warranty end, FortiGuard subscription expiry (UTM, ATP, etc.), support level
- Match by: asset `serial_number` → FortiCare registration

**WatchGuard**
- Portal: `https://www.watchguard.com/wgrd-support/overview`
- API: WatchGuard Partner API / RepliWeb — requires WatchGuard Partner Portal credentials
- Auth: API key or OAuth via partner account
- Key data: device serial → LiveSecurity expiry, support tier, appliance model
- Match by: asset `serial_number` → WatchGuard device record

**DB additions needed:**
- `vendor_warranties` table: `(id, tenant_id, asset_id, vendor, serial_number, contract_type, support_level, warranty_start, warranty_end, subscription_end, contract_sku, raw_response, last_synced_at)`
- Composite display: merge into existing asset warranty fields or surface as separate "Vendor Coverage" sub-section in Asset detail

**UI additions:**
- Asset detail: "Vendor Coverage" panel — contract type, support level, expiry badge (green/amber/red)
- Assets list: vendor warranty expiry column (sortable), filter by expiring within 30/60/90 days
- Global Assets page: cross-client expiry dashboard for all SonicWall/Fortinet/WatchGuard devices
- Client detail Hardware tab: highlight devices with expired or expiring vendor support

**Implementation notes:**
- Sync triggered manually or on schedule (nightly)
- Credential storage: per-tenant settings (vendor API key/token per vendor)
- Graceful fallback: if vendor API unavailable, surface last known data with `last_synced_at` timestamp

---

### UX / Navigation Overhaul — Priority

These are grouped together because they're interlocking — the Dashboard
tab bar only lands well on top of the new sidebar; the Roadmap redesign
depends on both; Deliverables surfaces under ENGAGE in the new sidebar.
Full specs linked.

#### Nav redesign + header search fix → [`docs/navigation-redesign.md`](docs/navigation-redesign.md)
Sidebar reorganized around workflows (DISCOVER / PLAN / ENGAGE /
PROCUREMENT / MANAGE). Global sidebar DISCOVER renamed to LIBRARY.
Dashboard horizontal tab bar (Overview / Client IQ / Analytics /
Action Items / Notes) matching LMX layout. Assessments sub-tabs
(Assessments / Standards / Profile). Profile becomes a pop-up that
auto-opens on unconfigured clients. Header search centered to fix
the 768-1000px viewport overlap bug. **Effort: 1-2 days.**

#### Roadmap page redesign (Kanban + List + drag/drop) → [`docs/roadmap-redesign.md`](docs/roadmap-redesign.md)
Toggle between Kanban (drag-drop cards between quarterly columns) and
List view (sortable/filterable table grouped by quarter). Per-column
financial rollups (one-time, monthly, annualized). Share-with-client
signed URL. New Initiative modal with fee schedule. Year navigator +
fiscal-year config. LMX-parity visual layout. **Effort: 3-5 days.**

#### MVP Deliverables (Word/PDF/Excel) → [`docs/deliverables-spec.md`](docs/deliverables-spec.md)
One-click export of Assessment (Word/PDF), Budget (Word/PDF/Excel),
and Roadmap (Word/PDF/Excel). Puppeteer for PDF (print-mode CSS on
existing pages), `docx` library for Word, `exceljs` for Excel.
Lives at ENGAGE > Deliverables under each client. **Effort: 2-3 days.**

Full Scheduled Reports module (templates, cron, email delivery) parked
until MVP usage validates the format.

#### Document Repository → [`docs/document-repository-spec.md`](docs/document-repository-spec.md)
Ships **before** MVP Deliverables matures — gives the vCIO a place to
upload polished LMX/MyITProcess example reports for client meetings
while Align's native exports are still being built. Tenant-level
(global sidebar MANAGE > Documents) and client-level (client sidebar
MANAGE > Documents) upload/list UI. New `documents` table, multer
file upload, 50 MB per file / 500 MB per tenant quota. Supported:
PDF, Word, Excel, PowerPoint, images. **Effort: 1-2 days. Ship first.**

#### Parent/Child Client Rollup → [`docs/parent-child-rollup.md`](docs/parent-child-rollup.md)
Scope toggle on parent Dashboard: Enterprise (data rolled up across
all child locations) vs. Location breakdown (per-location tabs).
Applies to assets, recommendations, initiatives, goals, action items,
agreements. Exports accept `enterprise=1` flag for consolidated or
per-location rollups. Schema exists (`parent_client_id`), 7 children
already in DB. **Effort: 3-4 days.**

### Other Planned Features

#### Budget Board — Fiscal Period View
Recommendations displayed by year + quarter with budget rollups per period. Drag-and-drop scheduling.

#### TipTap Rich Text Editors
Wire `@tiptap/react` (already installed) into assessment note textareas, recommendation executive summary, and the new Notes tab on client Dashboard (see `docs/navigation-redesign.md`).

#### Ticket Creation — Assessment Items
"Create Ticket" button on assessment items (currently placeholder) — create Autotask ticket linked to the specific finding with pre-filled description and priority.

#### KQM / Quoter Integration
Link quotes to recommendations from the PSA Opportunity modal. Placeholder in Recommendation Detail ready.

#### Scheduled Review Notifications
Email alerts for standards due for review based on `next_review_due`. Use existing Resend/nodemailer setup.

#### Client-Facing Report Generation (Full)
See `docs/deliverables-spec.md` "Future (after MVP)" section — template
designer, scheduled generation, email delivery, co-branded templates.
MVP one-click exports ship first.

#### Pax8 Credential Onboarding UI
Settings page section for Pax8 API credentials (OAuth client ID + secret), connection test button.

#### RocketCyber Integration
Security module data source — pull posture data into assessments.

#### TPRA (Third-Party Risk Assessment)
Spec'd but not built — vendor inventory + assessment flow.

#### Phase 4 Review Cycle Dashboard
Standalone page for review cycle engine (already built + endpoint
exists); currently only surfaced in client detail.

---

## 🔄 In Progress

*(None currently)*

---

## ✅ Recently Completed

- Hardware lifecycle filter tabs (All Active / Expiring Soon / Expired / EOL Soon / EOL / Decommissioned) — global Assets page + ClientDetail
- EOL date computation: uses `eol_date` if set, falls back to `purchase_date + asset_type.default_lifecycle_years`
- Recommendation Initiative-style detail page (PSA Ticket, PSA Opportunity, Budget line items, Assets, Executive Summary, Schedule Q1–Q4)
- Autotask ticket + opportunity creation from Recommendation detail (full picklist forms)
- Standards Library overhaul (Section → Category tree, Draft/Review/Approved workflow, How to Find + Why We Ask, review frequency)
- LMX Technology Alignment Assessment template seeded (27 items, 6 sections, ScalePad-style 4-response scoring)
- Assessment templates tab separated from Standards Library
- User invites via Resend email
- IT Glue orphan detection fix
- Autotask duplicate key conflict guard
