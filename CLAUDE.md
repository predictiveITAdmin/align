# predictiveIT Align — Codebase Guide

Strategic IT Alignment Platform for MSPs (vCIO/TAM/vCISO workflows): standards, assessments, asset lifecycle, roadmaps, budgets, EOS, CSAT, reporting. See [`docs/product-spec.md`](./docs/product-spec.md) for full product context.

---

## 🎯 Current Focus (2026-04-24)

**Active:** Orders QA instrumentation + Phase 4 standards import + distributor onboarding.

**Distributor status:**
- TD Synnex eSolutions — ✅ Active (PO-driven SOAP/XML sync running)
- Ingram Micro Xvantage XI — 🟡 App approved + Production, needs "Order Management v6" product added in API Catalog (currently only v7 selected)
- Dell Premier — 🔲 Adapter built, awaiting Client ID + Secret from Dell account team
- Amazon Business — ✅ CSV import active
- Provantage — ✅ Manual entry active

**Next priorities:**
1. Ingram Micro: add "Order Management v6" to API Catalog in Ingram portal, then test connection
2. Obtain Dell Premier OAuth2 credentials from Dell Premier portal
3. Approve 1,379 standards drafts (bulk by section in Standards page)
4. Phase E: QuickBooks Online integration (receipt confirmation → QBO PO update)
5. UI actionability pass — pop-up cards + dashboard widgets (see CHANGELOG 2026-04-22)

**Recently shipped (2026-04-24):**
- **Orders QA widgets** — PO Not Written to AT + Multi-Distributor Opps tiles with reconciliation (`src/routes/orders.js` qa/* endpoints, `Orders.jsx` widgets)
- **Part-overlap SKU filter** — orderMatcher excludes Labor-*, Cabling-*, Shipping, Freight from match confidence (prevents false matches from quote boilerplate)
- **Response modes on standards** — binary/ternary/graded/informational classification; reduced responses 6,935→4,376 for imported drafts
- **Framework Gap Assessment** — new `assessment_type='framework_gap'` pulls only standards tagged with the selected framework (CMMC/ISO/PCI/HIPAA/NIST)
- **Answer inheritance** — any new assessment auto-pre-fills response from most recent prior assessment for same `(client, standard)`; violet "↩ Inherited" badge
- **Evidence examples** (text[] on standards) — topic-matched compliance artifacts
- **Cross-framework badges** — assessment items show all framework tags (e.g. one MFA standard shows CMMC + NIST + ISO + PCI + HIPAA)
- **Bulk approve drafts** — `POST /api/standards/bulk-approve` + green button on Standards page. Scope-aware (section / category / all). Use to approve the 1,379 MyITProcess drafts in batches.
- **Resolve:** SettingsShell and AdminShell now expose the other shell's nav when user is global_admin (symmetric nav)
- **Infra:** pm2-logrotate installed; truncated 11.6GB of bloat that caused 2026-04-23 disk-full → M365 SSO outage

**Recently shipped (2026-04-23):**
- Richer order detail card (created timestamp, full ship-to block, multi-tracking, long descriptions)
- Predictive PO Mapper — 5-strategy suggestion list with confidence + human-readable reasons

**Recently shipped (2026-04-22):**
- Opportunities sync fixes: pagination 405-retry bug fixed, batch quotes (952 synced in 2 pages vs 2,271 calls), incremental quote items, `forceSince` bypass parameter, `assigned_resource_name` from AT Resources API
- TD Synnex eSolutions adapter live + sync_mode filter fix in `distributorSync.js`
- Dell Premier OAuth2 adapter built (`src/services/distributors/dell_premier.js`)
- Opportunities page: Owner + Category + Created/Closed Date columns, multi-select client + owner filters, date range presets, enhanced 8-field detail slide-over
- Product spec: Dell Premier section, Parent/Child client Locations tab spec
- Committed: `e4cd199` (sync fixes), `c9593f3` (sync_mode fix), `7937144` (Opps UI)

**Critical field name fix (2026-04-22):** Autotask Opportunities API returns `companyID` (not `accountID`) for the company link. Fixed in `opportunitiesSync.js` and backfilled 121 records via SQL UPDATE.

## 📦 Parked — resume when ready

- **Approve 1,379 imported standards drafts** in the Standards page UI. Bulk-approve by section is fastest. CMMC / PCI-DSS / ISO sections are safe to bulk-approve (authoritative content), NIST CSF + HIPAA deserve closer review.
- **Remaining dedup candidates** — 18 probable (80-89%) + 16 possible (75-79%) pairs in `/tmp/standards_import/dedup_second_pass.md`. 1 very-likely executed 2026-04-24 (ISO A.5.24 Incident Response).
- **Broad auto-mapping** — only 3 of 99 clients have `client_standards` rows. Run `POST /api/standards/auto-map-all` after drafts are approved.
- **Re-sync opportunities** to backfill `assigned_resource_name` — DB shows 0 / 2,272 have owner name populated even though sync code supports it (run a full forceSince pass).
- **Parent/Child Locations tab** — 7 child clients already exist in DB; spec in `docs/product-spec.md`.

## 💾 Backups

- pg_dump snapshots in `~/backups/align/` (Apr 21 2026 post-Phase-4)
- All code pushed to GitHub `predictiveITAdmin/align` (main branch)
- Import pipeline preserved at `scripts/standards_import/` (versioned)

---

## Repo Layout

```
/opt/align
├── src/
│   ├── server.js                 Entry point
│   ├── routes/                   Express routers
│   │   ├── assessments.js        Assessment templates + responses + framework gap
│   │   ├── standards.js          Tech standards + categories + client mappings
│   │   ├── clientStandards.js    Per-client standards (filters, review cadence)
│   │   ├── assets.js             Unified asset view (deduplicated across APIs)
│   │   ├── clients.js            Client list, details, tabs (assets/contacts/licenses)
│   │   ├── recommendations.js    Remediation recs derived from assessments
│   │   ├── initiatives.js        Client initiatives + budget tie-in
│   │   ├── goals.js, budget.js, templates.js, actionItems.js, software.js
│   │   ├── saas-licenses.js      M365/Google license views
│   │   ├── warrantyLookup.js     Direct-manufacturer warranty queries
│   │   └── integrations.js       OAuth + connection test for 8 APIs
│   ├── services/                 Sync services (one per API + shared utilities)
│   │   ├── autotaskApiService.js
│   │   ├── assetLifecycleService.js
│   │   ├── msPartnerSync.js, pax8Sync.js, softwareSync.js
│   │   ├── warrantyLookupService.js, emailService.js, scheduler.js
│   │   └── ...
│   ├── lib/                      Pure helpers (assetUpsert, softwareNormalize)
│   └── migrations/, db/          SQL migrations + seed scripts
│
├── client/
│   └── src/
│       ├── App.jsx, components/, pages/
│       │   ├── Assessments.jsx, AssessmentDetail.jsx
│       │   ├── Standards.jsx, Assets.jsx, ClientDetail.jsx
│       │   └── ...
│       └── ...
│
├── uploads/                      Reference templates (MITP/LMX/taxonomy workbooks)
└── docs/                         Spec + design docs (this folder)
```

---

## Tech Stack

- **Backend:** Node.js, Express, PostgreSQL 15 (on 10.168.2.46, separate `align` database)
- **Frontend:** React + Vite + Tailwind
- **Process:** PM2 (`pm2 restart align`)
- **Port:** 3002 (backend), nginx serves frontend separately
- **Auth:** local + Microsoft Entra SSO (same providers as Resolve)

---

## How to Build & Deploy

```bash
# ⚠️  IMPORTANT: nginx serves from /var/www/align/ — NOT /opt/align/client/dist/
# You MUST run the deploy script after any frontend change, or users won't see it.

# Full deploy (frontend + backend) — USE THIS:
/opt/align/deploy.sh

# What deploy.sh does:
#   1. npm run build  (outputs to /opt/align/client/dist/)
#   2. sudo cp -r /opt/align/client/dist/. /var/www/align/   ← the step that matters
#   3. Cleans stale hashed asset files from /var/www/align/assets/
#   4. pm2 restart align

# Backend-only change (no frontend):
pm2 restart align
```

---

## Data Sources (9 APIs)

Full reference in [`docs/api-integrations.md`](./docs/api-integrations.md):

ScalePad, MyITProcess, Autotask, Datto RMM, IT Glue, SaaS Alerts, Auvik, Customer Thermometer, plus custom EOS module.

**Canonical client key:** Autotask Company ID (cross-references every other API).

---

## Key Conventions

- **Active customers only:** every sync must filter to active + customer relationship type. See [`docs/active-customers-only.md`](./docs/active-customers-only.md). Required for every new sync service.
- **Shared Autotask/Datto creds:** live in `/opt/resolve/.env` and are consumed by Align services too.
- **Multi-tenant MSP model:** role-based access (Admin, vCIO/vCISO, TAM, Client read-only).
- **Report builder replaces BrightGauge** — native templated output, no external BI tool.
- **EOS custom-built** — Rocks, Scorecard, To-Dos, Issues linked to tech initiatives.

---

## Related Docs in This Repo

- [`docs/product-spec.md`](./docs/product-spec.md) — full product + architecture spec
- [`docs/phase-4-assessments.md`](./docs/phase-4-assessments.md) — assessment module design (onboarding phases + review cycles)
- [`docs/order-management-spec.md`](./docs/order-management-spec.md) — Order Management module (Autotask Opps/Quotes + distributor sync + QBO + client portal)
- [`docs/api-integrations.md`](./docs/api-integrations.md) — all 9 API connections with auth + endpoints
- [`docs/active-customers-only.md`](./docs/active-customers-only.md) — sync filter rule
- [`scripts/standards_import/README.md`](./scripts/standards_import/README.md) — MyITProcess standards import pipeline
- [`README.md`](./README.md), [`ROADMAP.md`](./ROADMAP.md)

---

## Companion Project

Shares infrastructure + Autotask/Datto creds with **predictiveIT Resolve** at `/opt/resolve`. Resolve docs live in `/opt/resolve/docs/`. The two apps run as separate PM2 processes on different ports but share the Postgres instance on 10.168.2.46.
