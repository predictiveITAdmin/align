# Phase 4 — Standards-Based Assessment & Review Cycles

Assessment module design and implementation. Covers onboarding phases
(critical-first then remaining), recurring review cycles per frequency,
framework-specific gap assessments, per-client review cadence, and
answer inheritance across assessments.

**Status:** Core built and live (2026-04-24). 1,379 MyITProcess standards
imported as drafts awaiting approval. Bulk-approve action shipped; see
[Bulk Approve Drafts](#bulk-approve-drafts-shipped-2026-04-24) below.

---

## Assessment Types

All assessments carry `assessments.assessment_type` (enum):

| Type | What it pulls | Use case |
|---|---|---|
| `onboarding_phase1` | Only `priority='high'` applicable standards | Critical gaps first during new-client onboarding |
| `onboarding_phase2` | All other priorities (`medium`, `low`) applicable | Remaining controls after Phase 1 remediated |
| `recurring_review` | Only standards where `last_reviewed_at` is older than their `review_frequency` interval (or NULL) | Cadence-driven ongoing reviews |
| `framework_gap` | Standards with a matching `standard_framework_tags.framework` (filter on `metadata.framework`) | CMMC / ISO / PCI / HIPAA / NIST gap assessments |
| `ad_hoc` | All applicable standards | General full alignment pass |

For `framework_gap`, the `framework` is stored in `assessments.metadata`
as `{"framework": "CMMC-L2"}` (or similar). The picker in the New
Assessment modal reads from `GET /api/assessments/frameworks` which
returns per-framework counts from `standard_framework_tags`.

## Answer Inheritance ("Answer Once, Satisfy Many")

When an assessment is created (any type), `assessment_items.response_id`
is **pre-filled** from the latest response for the same
`(client_id, standard_id)` pair across any prior assessment. Metadata
column stores `inherited_from_assessment_id`. The UI surfaces this as:

- Violet "↩ Inherited" badge on the item row
- Banner in the notes panel: "Inherited answer — this response was
  carried from *{source assessment name}*. Select a new response to
  override for this assessment."

A single master "MFA on Admins" standard tagged with CMMC-L2 IA.L2-3.5.3,
NIST-800-171 3.5.3, ISO A.5.17, PCI-DSS 8.4, HIPAA 164.312(a)(1) —
answered once in a quarterly operational review — will pre-fill into
subsequent CMMC, ISO, PCI, and HIPAA Gap Assessments.

## Response Modes

Not every compliance question needs a 5-level maturity scale. Controls
like "Does a policy exist?" are fundamentally yes/no. Each standard now
carries `standards.response_mode`:

| Mode | Responses generated | Example |
|---|---|---|
| `binary` | Compliant / Non-Compliant / NA (3 rows) | "Are all server OSes 2016 or greater?" |
| `ternary` | Yes / Partial / No / NA (4 rows) | "Do all workstations meet minimum specs? [checklist]" |
| `graded` | Satisfactory / Acceptable Risk / Needs Attention / At Risk / NA (5 rows) | "Do all endpoints meet our security baseline?" (coverage matters) |
| `informational` | Documented / NA (2 rows) | "What VLANs are in place?" — data-intake |

Classifier lives at `scripts/standards_import/05_classify_binary.py`.
Keys on: multi-question-mark count (multi-part → graded), list/checklist
patterns ("meet the following…" → graded), graded coverage language
("all endpoints", "100%", "consistently" → graded), and specific
question-start phrases ("does the organization document…" → binary).

Binary standards render as a 3-pill row in the existing response picker
— no UI branch, just fewer pills. Ternary/informational work the same.

## Per-Client Review Cadence

`clients.review_cadence` (enum: `monthly | quarterly | semi_annual |
annual`). Controls how the recurring review engine surfaces due standards
for a given client. Smaller clients with quarterly or annual cadence get
fewer recurring reviews.

`GET /api/assessments/review-cycle[?client_id=]` computes what's due per
client: a standard is due when `NOW() > last_reviewed_at + review_frequency`.
Returns aggregated counts per client (total applicable, due, never
reviewed, overdue high priority) and the list of due standards.

Per-standard tracking is in `client_standards.last_reviewed_at` — updated
automatically on assessment completion for every item with a
`response_id`.

## Evidence Examples (Compliance)

Framework-tagged standards carry `standards.evidence_examples text[]` —
topic-matched example artifacts for the vCIO to collect:

- Encryption → "Screenshot of BitLocker/FileVault encryption status",
  "Cryptographic key inventory with rotation schedule"
- MFA → "Screenshot of Entra ID Conditional Access policies",
  "Privileged account audit showing MFA enforcement"
- Patching → "Datto RMM patch compliance report", "Vulnerability scan
  report (before/after remediation)"
- Logging → "SIEM dashboard screenshot showing covered log sources",
  "Sample audit log export"

Displayed in the assessment conduct UI when a standard's detail panel
is expanded.

## Cross-Framework Badges

Each assessment item shows the full list of frameworks tagging its
master standard as small pill badges. One MFA control can render
six framework tags (CMMC-L2, NIST-800-171-R2, ISO-27001-2022, PCI-DSS-4,
HIPAA, NIST-CSF-2) with their respective control references. Answering
it once satisfies all of them.

## Scoring

**Weighted by priority** on assessment completion:

```
priority   weight
  high     3
  medium   2
  low      1

score_per_level = { satisfactory: 100, acceptable_risk: 80,
                    needs_attention: 40, at_risk: 0, not_applicable: null }

overall = Σ(weight × score) / Σ(weight)    ← NAs excluded
```

Also computed per domain (section) and stored in
`clients.alignment_score_by_domain` as JSONB `{domain_id: {name, score,
total, answered}}`. Overall score written to `clients.health_score`.
`clients.last_assessment_date` updated to today.

## Data Model Summary

```
assessments
  assessment_type    enum: onboarding_phase1|onboarding_phase2|
                           recurring_review|framework_gap|ad_hoc
  metadata           jsonb — for framework_gap: {framework: 'CMMC-L2'}
  ...

assessment_items
  client_standard_id uuid → client_standards.id  (new)
  response_id        uuid → standard_responses.id
  metadata           jsonb — may contain inherited_from_assessment_id
  ...

standards
  response_mode      text  — binary | ternary | graded | informational
  evidence_examples  text[] — topic-matched evidence hints
  import_source      text   — provenance ('myitprocess_2026_04_17')
  import_row_id      text
  ...

standard_framework_tags
  framework          text   — CMMC-L2 | ISO-27001-2022 | NIST-800-171-R2 | ...
  framework_reference text  — control ID ('IA.L2-3.5.3', 'A.5.17', '8.4')
  framework_evidence  text  — optional framework-specific evidence note
  UNIQUE (standard_id, framework)

client_standards
  last_reviewed_at   timestamptz — per client+standard, updated on assessment complete

clients
  review_cadence     enum: monthly | quarterly | semi_annual | annual (default quarterly)
  alignment_score_by_domain jsonb — populated on assessment complete
  last_assessment_date date
```

## UI Surfaces

**Assessments page:** mode toggle (Standards-Based vs Template-Based),
assessment type picker (all 5 types), framework picker appears when
`framework_gap` selected, client + name inputs.

**Assessment conduct (`AssessmentDetail.jsx`):** domain → category →
standard hierarchy with 3/4/5 response pills per standard's mode,
inherited badges, framework badges, evidence examples on expand,
comparison with previous assessment, vCIO business analysis tab for
template mode only.

**Client Standards tab (`ClientDetail.jsx`):** wide sidebar with
collapsible sections, filters for priority/tier/delivery/source/
frequency/review status, per-standard review frequency + last-reviewed
date + last response badge on each card.

**Client Profile tab:** Review Cadence selector (Monthly / Quarterly /
Semi-Annual / Annual).

## Bulk Approve Drafts (shipped 2026-04-24)

The Standards page exposes a green **"Approve N Drafts"** button next to
"Add Standard" whenever the current section/category scope contains
draft standards. It hits `POST /api/standards/bulk-approve` with either
`{ section_id }` (approve all drafts in a section) or `{ ids: [...] }`
(specific ids). Approved standards become immediately available to
framework gap assessments and client auto-mapping.

Recommended approval order (authoritative → needs-review):

1. CMMC Level 1 (14) and Level 2 (110) — authoritative government content
2. PCI-DSS 4.0.1 (123) — authoritative PCI SSC content
3. NIST 800-171 R2 (167) — authoritative NIST
4. NIST CSF 2.0 (106) — authoritative
5. ISO 27001:2022 (366) — ISO; large batch, review a few per Annex before approving
6. HIPAA Cybersecurity (249) — compiled from HHS 405(d) guidance; worth review
7. Server Infrastructure (98), Hardware & Peripherals (31),
   Physical & Environmental (69), etc. — operational content

## Not Yet Built (Parked)

- **Standards drafts approval** — 1,379 drafts pending; **use the
  Bulk Approve button on the Standards page** (section_id scope is
  fastest)
- **Second-pass dedup** — 8 merges executed (see
  `scripts/standards_import/08_execute_merges.js` and
  `09_execute_batch_merges.js`); ~10 possible candidates still in
  `/tmp/standards_import/dedup_second_pass.md` at 75-79% that could be
  re-reviewed after drafts are approved
- **Broad auto-mapping** — only 3 of 99 clients have `client_standards`
  rows populated; run `POST /api/standards/auto-map-all` after drafts
  are approved
- **Review cycle dashboard page** — engine + endpoint exist but no
  standalone UI page yet (only client-detail view)
- **Mass assessment creation** — no "create onboarding phase 1 for all
  new clients in X vertical" bulk action yet
- **Merge candidate review UI** — borderline dedup candidates currently
  require a manual curated batch script; a review/approve UI on the
  Standards page would speed future reimports

## Related Files

- `src/routes/assessments.js` — assessment CRUD + framework_gap +
  inheritance + frameworks list + review-cycle engine
- `src/routes/standards.js` — standards library + framework tags +
  auto-map-all
- `src/routes/clientStandards.js` — per-client mappings with
  review-status filters
- `src/routes/clients.js` — review_cadence PATCH support
- `client/src/pages/Assessments.jsx` — list + New Assessment modal
- `client/src/pages/AssessmentDetail.jsx` — conduct UI + response
  renderer + StandardsItemRow
- `client/src/pages/ClientDetail.jsx` — ClientStandardsTab +
  NewAssessmentModal + ProfileTab review cadence
- `client/src/pages/Standards.jsx` — library + Client Mapping tab
- `scripts/standards_import/` — import pipeline (extract, cluster,
  classify, import, dedup) — versioned in `/tmp/standards_import/`
  during the build-out
