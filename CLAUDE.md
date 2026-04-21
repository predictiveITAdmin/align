# predictiveIT Align — Codebase Guide

Strategic IT Alignment Platform for MSPs (vCIO/TAM/vCISO workflows): standards, assessments, asset lifecycle, roadmaps, budgets, EOS, CSAT, reporting. See [`docs/product-spec.md`](./docs/product-spec.md) for full product context.

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
# Backend changes
pm2 restart align --update-env

# Frontend build + deploy — verify the nginx root path for Align
cd /opt/align/client && npx vite build
# Then copy dist/ to the configured nginx web root
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
- [`docs/api-integrations.md`](./docs/api-integrations.md) — all 9 API connections with auth + endpoints
- [`docs/active-customers-only.md`](./docs/active-customers-only.md) — sync filter rule
- [`README.md`](./README.md), [`ROADMAP.md`](./ROADMAP.md)

---

## Companion Project

Shares infrastructure + Autotask/Datto creds with **predictiveIT Resolve** at `/opt/resolve`. Resolve docs live in `/opt/resolve/docs/`. The two apps run as separate PM2 processes on different ports but share the Postgres instance on 10.168.2.46.
