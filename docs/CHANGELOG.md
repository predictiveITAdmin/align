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
