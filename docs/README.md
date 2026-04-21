# Align Documentation

Index of all specs, decisions, and references. If you're new to this repo,
read in this order:

1. **[`product-spec.md`](./product-spec.md)** — what Align IS (strategic)
2. **[`for-developers.md`](./for-developers.md)** — porting prototype → production (READ FIRST if you're porting)
3. **[`CHANGELOG.md`](./CHANGELOG.md)** — what changed recently, per module
4. Module specs below — tactical design for each module

## Module Specs

| Module | Spec | Status | Ported? |
|---|---|---|---|
| Assessments (Phase 4) | [`phase-4-assessments.md`](./phase-4-assessments.md) | Implemented | ☐ |
| Standards import (one-off) | [`../scripts/standards_import/README.md`](../scripts/standards_import/README.md) | Complete | N/A (one-time) |
| Order Management | [`order-management-spec.md`](./order-management-spec.md) | Requirements locked | ☐ |
| Asset Lifecycle | *(inline in product-spec)* | Implemented | ☐ |
| Client Standards | *(inline in product-spec)* | Implemented | ☐ |
| Reporting | *(TBD)* | Not started | — |
| Client Portal | *(TBD)* | Not started | — |

## Cross-cutting References

| Doc | Purpose |
|---|---|
| [`api-integrations.md`](./api-integrations.md) | All 9 external API connections (auth, endpoints, record counts) |
| [`distributor-api-research.md`](./distributor-api-research.md) | Hardware distributor API research + access game plan |
| [`active-customers-only.md`](./active-customers-only.md) | Sync filter rule (applies to every sync service) |
| [`adr/`](./adr/) | Architecture Decision Records (numbered, append-only) |

## Document Statuses

Every module spec carries a status in its header:

- **Draft** — requirements still being gathered, do not implement
- **Approved** — ready to build
- **In Progress** — actively being built in this prototype
- **Implemented** — shipped in this prototype; spec is the living truth
- **Ported** — developer has replicated to production
- **Superseded** — replaced by another doc (link in header)

The **Ported** column in the module table above flips ☐ → ✅ once your
developer has re-implemented that module in production. This is how we
track what's "done" in terms of the full prototype → production handoff.

## How to Use These Docs

### If you're **Jason** (iterating with Claude Code)
- Claude updates the module spec as we iterate — spec stays the final intent
- Claude appends to CHANGELOG.md for every meaningful change (not tiny tweaks)
- Claude writes an ADR for any architectural decision with cross-module impact

### If you're **the developer** (porting to production)
- Start at [`for-developers.md`](./for-developers.md)
- Each module spec is your build spec — the prototype is reference impl only
- CHANGELOG tells you what's stable vs what's still iterating
- ADRs tell you why architectural choices were made (don't second-guess them
  without a new ADR)

### If you're **Claude** (a future AI session)
- Load `/opt/align/CLAUDE.md` for current focus + parked items
- Load the specific module spec you're working on
- When making changes, update the spec + CHANGELOG + relevant ADR in the
  same commit
