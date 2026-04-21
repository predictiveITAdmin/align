# ADR-001: Autotask Company ID is the canonical client key

**Status:** Accepted  •  **Date:** 2026-03-27

## Context

Align syncs data from 9+ external APIs that each have their own identifier
for a client (MyITProcess, Datto RMM, IT Glue, SaaS Alerts, Auvik, Customer
Thermometer, Pax8, etc.). We need ONE authoritative ID to cross-reference
a client across every data source.

## Decision

**Autotask Company ID (integer) is the canonical key for every client.**

- Align's `clients.autotask_company_id bigint` column is the join key
- Every sync service maps its foreign system's ID → Autotask Company ID
  before writing data
- The `clients` table is seeded from Autotask Companies; other systems'
  client records are never auto-created — they must match an existing
  Autotask company

## Consequences

**Positive:**
- Clean data model: one `clients` row per company, no duplicates
- Autotask stays the system of record for client identity (customers
  are managed there by sales/ops)
- Cross-system queries are trivial (join on clients.id)

**Negative:**
- If a client exists in Datto but not Autotask, we skip it during sync
  (acceptable — Autotask should be complete; if not, fix Autotask first)
- Autotask API is the critical path for all syncs — outages cascade
- Renaming/merging companies in Autotask requires coordinated cleanup

## Related

- `docs/api-integrations.md` — full list of APIs mapped to canonical ID
- ADR-002 (multi-tenancy) — stacks on top of this
