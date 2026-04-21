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

## Why This Exists

Key differentiator for predictiveIT's MSP practice — replaces ScalePad LMX + MyITProcess + BrightGauge with a unified platform.

All architecture decisions should optimize for TAM/vCIO workflow efficiency. Every module should tie back to client-facing deliverables (QBR reports, roadmap PDFs, budget presentations).
