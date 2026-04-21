# Architecture Decision Records

Short focused docs for architectural decisions that affect multiple
modules or non-obvious tradeoffs. Format per ADR:

- **Title:** NNN-short-title.md
- **Status:** Proposed | Accepted | Superseded by NNN
- **Context:** what situation led to this
- **Decision:** what was decided
- **Consequences:** pros, cons, ripple effects

ADRs are numbered sequentially (NNN). Once Accepted, they are **never
edited** — if the decision changes, a new ADR supersedes this one and
this ADR's status becomes "Superseded by NNN".

## Current ADRs

| # | Title | Status |
|---|---|---|
| 001 | [Autotask Company ID as canonical client key](./001-autotask-company-id-canonical.md) | Accepted |
| 002 | [Multi-tenancy via tenant_id column](./002-tenant-id-multi-tenancy.md) | Accepted |
| 003 | [PO field stored as array, not comma-separated string](./003-po-field-as-array.md) | Accepted |
| 004 | [Framework tags on master standards (answer once, satisfy many)](./004-framework-tags-on-masters.md) | Accepted |
