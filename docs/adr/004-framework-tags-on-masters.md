# ADR-004: Framework tags on master standards ("answer once, satisfy many")

**Status:** Accepted  •  **Date:** 2026-04-21

## Context

A single technology control (e.g., "MFA enforced on admin accounts")
appears as a distinct requirement in multiple compliance frameworks:
- CMMC L2 IA.L2-3.5.3
- NIST 800-171 R2 3.5.3
- ISO 27001:2022 A.5.17
- PCI-DSS 4.0.1 Req 8.4
- HIPAA 164.312(a)(1)

If we store the control as a separate row per framework, the TAM has to
answer the same question 5+ times per assessment. That's bad UX, lossy
(answers drift across copies), and wastes data.

Options considered:
- **One row per framework control** — natural for compliance tooling,
  creates duplication + multi-answer problem
- **Master control + framework tags** — single source of truth, single
  answer satisfies all tagged frameworks

## Decision

**Each standard is stored ONCE in the `standards` table as a "master control".**
Framework mappings live in `standard_framework_tags`, with one row per
(standard_id, framework) pair, including `framework_reference` (the
control ID in that framework: "IA.L2-3.5.3", "A.5.17", "Req 8.4", etc.)

Assessment UI:
- Framework Gap assessment pulls standards WHERE a framework tag matches
- Each standard shows badges for every framework it satisfies
- **Answer inheritance** — when creating any new assessment, the latest
  answer for that client + standard auto-populates (regardless of which
  prior assessment it came from). UI shows "↩ Inherited" badge;
  user can override.

## Consequences

**Positive:**
- TAM answers each control ONCE per review cycle; answer propagates to
  all compliance framework reports automatically
- Spec alignment — if NIST updates 3.5.3, we update ONE standard, not N
- Cross-framework gap analysis is trivial (which frameworks do we
  satisfy with our current answers?)
- Adding a new framework is O(N tags to create) not O(N+ new standards)

**Negative:**
- Answer inheritance can be wrong if the controls actually differ
  subtly between frameworks (e.g., PCI requires 90 days for inactive
  accounts, our standard is stricter at 45 days). Currently handled by
  user reviewing the inherited answer + overriding if needed.
- More schema than a flat "one row per framework control" approach
- Requires the import pipeline (scripts/standards_import/) to dedup at
  import time — 1,865 source questions → 1,387 master controls after
  95% similarity clustering

## Enforcement / Migration

- Master standards in `standards` table, with `is_universal bool` (true
  if operational, false if compliance-specific)
- Framework tags in `standard_framework_tags` with unique `(standard_id,
  framework)` — so a standard can't have duplicate tags for one framework
- Existing 134 Align operational standards were merged with imported
  compliance drafts where they matched (see 2026-04-21 CHANGELOG);
  example: "Incident response plan documented" now carries 4 framework
  tags (HIPAA, ISO-27001, NIST-800-171, PCI-DSS).

## Related

- `docs/phase-4-assessments.md` — full assessment module design
- `scripts/standards_import/README.md` — dedup + merge pipeline
- `docs/order-management-spec.md` — uses similar "master + tags" pattern
  for distributor orders + framework mappings (future consideration)
