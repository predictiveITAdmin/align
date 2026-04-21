# ADR-002: Multi-tenancy via tenant_id column

**Status:** Accepted  •  **Date:** 2026-03-27

## Context

Align is designed as a multi-tenant MSP platform — one deployment serves
multiple MSPs (tenants), each with their own clients, standards,
assessments, etc. We need data isolation between tenants.

Options considered:
- **Separate databases per tenant** — strongest isolation but heavy ops
- **Separate schemas per tenant** — isolation + single DB but complex
- **Row-level tenancy (tenant_id column)** — simplest, relies on query filters

## Decision

**Every table has `tenant_id uuid NOT NULL` and every query filters by it.**

- The `tenants` table holds the master list of MSP organizations
- User sessions carry `tenant_id` in JWT
- Middleware (`tenantMiddleware`) extracts tenant from the session and
  makes it available on `req.tenant.id`
- Every SQL statement in routes/services must filter by `tenant_id = $1`
- Unique constraints include `tenant_id` as a column (e.g., `UNIQUE
  (tenant_id, name)` on standard_sections)

## Consequences

**Positive:**
- One database, one schema — simple ops
- Cross-tenant queries possible for admin views (with care)
- Fast to add new tenants (just insert a row)

**Negative:**
- Application-level enforcement — a missed filter leaks data across
  tenants. Code review + automated tests must catch this.
- Backup/restore of a single tenant is harder than DB-per-tenant
- Noisy-neighbor risk (one tenant's bulk operations affect others) —
  mitigated by connection pool limits + query timeouts

## Enforcement

- Every new route must use `req.tenant.id` in WHERE clauses
- Every new table migration must include `tenant_id uuid NOT NULL`
- Consider Postgres row-level security (RLS) for defense in depth — not
  yet implemented, tracked as a future enhancement

## Related

- ADR-001 — Autotask Company ID canonical key (scoped per-tenant)
