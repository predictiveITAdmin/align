# Technology & Business Alignment Module (TAM) — AI Research Brief v2
**Project:** predictiveIT Align Platform — TAM Module Redesign  
**Date:** April 2026  
**Prepared by:** Jason / predictiveIT  

---

## 1. Project Overview

predictiveIT is an MSP serving ~40 clients across Florida. We are rebuilding our Technology & Business Alignment Module (TAM) inside a custom platform called **Align** (Node.js/Express + React + PostgreSQL). The new TAM module should work like **MyITProcess** — a global standards library that all clients are assessed against — rather than per-client assessment templates.

The platform already has a working template-based assessment system. We are NOT removing it. We are adding a new standards-library-driven layer on top that is more scalable, more aligned to frameworks, and more useful for vCIO/TAM workflows.

---

## 2. Current System (What Already Exists)

### Database Schema (existing, do not break)
```
assessment_templates         — named templates
template_sections            — sections within a template
template_items               — individual questions/standards
template_item_responses      — 5-level response rubric per item (satisfactory/acceptable_risk/needs_attention/at_risk/not_applicable)
assessments                  — client assessment instances
assessment_answers           — client answers per item
clients                      — 40 clients with vertical field
users                        — tenant users with roles (tenant_admin, vcio, tam, engineer)
recommendations              — roadmap action items linked to clients
```

### Current Template System
- Template → Section → Item → Responses (5 levels)
- Assessments created per client using a template
- Answers saved with response selection, internal notes, public notes
- Overall score calculated on completion (weighted by section/item weight)
- Comparison against previous assessment supported

### API Integrations Already Live
- **Autotask PSA** — contacts, companies, assets, tickets (filter: active + customer type)
- **Datto RMM** — devices, alerts
- **IT Glue** — documentation
- **ScalePad Lifecycle Manager** — hardware EOL/warranty data
- **SaaS Alerts** — SaaS security monitoring
- **Auvik** — network topology

---

## 3. Source Material Analyzed

### 3A. MyITProcess (MITP) Assessment Template
Structure: **Section → Category → Question**  
Total: **9 Sections, 62 Categories, 415 Standards**  
Review frequency: defined per category (1, 2, 3, 6, 11, 12 months)  
Priority per question: High / Medium / Low  
Rich fields per question: `question_text`, `why_we_ask`, `how_to`

**Sections:**
| Section | Categories | Questions |
|---|---|---|
| Onboarding Discovery | 10 | 64 |
| Core Infrastructure | 4 | 33 |
| NIST CSF 2.0 | 22 | 106 |
| Server Infrastructure | 11 | 117 |
| Server Room/Data Center | 5 | 31 |
| Cybersecurity | 3 | 27 |
| Hardware | 4 | 23 |
| Software | 2 | 6 |
| Business Continuity | 1 | 8 |

**Sample categories with frequencies:**
- Endpoints Infrastructure → 12 months, 4 Qs, High/Medium priority
- Network Infrastructure → 12 months, 11 Qs
- Firewall → 2 months, 9 Qs, High priority
- NIST CSF 2.0 (GV.OC through RC.CO) → 3 months each
- Active Directory → 12 months, 7 Qs
- Backup Verification → 1 month, 3 Qs
- Virtual Host → 3 months, 18 Qs
- Password Policy → 6 months, 12 Qs
- Disaster Recovery → 11 months, 8 Qs

### 3B. LifeCycle Insights (LCM) Assessment Templates
**37 CSV files** with full 5-level scoring rubrics pre-written per standard.  
Format: `assessment_name, category, item, scoring_instructions, explanation, not_applicable_response, unknown_response, at_risk_response, needs_attention_response, acceptable_risk_response, satisfactory_response`

**TAM Monthly Rotation (12 templates):**
| Month | Template | Items |
|---|---|---|
| January | Network Core (Remote) | 9 |
| February | Cybersecurity Controls (Remote) | 5 |
| March | Backup & DR (Remote) | 5 |
| April | Endpoint Lifecycle (Remote) | 4 |
| May | Wireless & Segmentation (Remote) | 4 |
| June | Physical Infrastructure (Onsite) | 5 |
| July | Mid-Year Alignment (Remote) | 3 |
| August | Identity & Access (Remote) | 3 |
| September | Physical Security (Onsite) | 2 |
| October | Hardware Lifecycle Planning (Remote) | 3 |
| November | Compliance & Policy (Remote) | 4 |
| December | Annual Readiness (Remote) | 3 |

**Compliance Framework Templates:**
| Template | Items | Cats |
|---|---|---|
| CIS Critical Security Controls v8 | 61 | 8 |
| CIS v8 + Standards | 154 | 19 |
| CMMC 2.0 Level 1 | 17 | 6 |
| CMMC 2.0 Level 2 | 93 | 14 |
| NIST CSF 2.0 | 106 | 22 |
| NIST SP 800-171 Access Control | 71 | 22 |
| HIPAA (DeepNet Foundational) | 73 | 6 |
| PCI DSS v4.0 | 322 | 14 |
| ISO/IEC 27001:2022 | 73 | 7 |
| Core Networking Assessment | 35 | 4 |
| Cyber Security Assessment | 49 | 19 |
| Microsoft 365 Core Alignment | 25 | 23 |
| TAM Monthly Remote Review | 138 | 23 |
| Onboarding Core Alignment | 45 | 4 |
| Base Policy & Procedure | 7 | 1 |

**Sample LCM standard with rubric (Firewall Warranty & Support):**
- **scoring_instructions:** Verify firewall warranty and vendor support status.
- **explanation:** Firewalls without active support pose a significant security and operational risk.
- **not_applicable:** Firewall is not needed
- **at_risk:** Firewall is out of warranty and not under vendor support or no firewall is in use.
- **needs_attention:** Firewall is supported but warranty or support expires within 6 months.
- **acceptable_risk:** (blank)
- **satisfactory:** Firewall is under active warranty and vendor support.

### 3C. predictiveIT Taxonomy v4
Internal ticket classification system. Relevant to TAM for:
- **LOB Application Inventory** — real apps used by our clients (source of tech stack tags):
  - Adobe Acrobat (11 clients), QuickBooks (8 clients), eClinicalWorks (2 clients), ServiceTitan (1), BlueBeam (2), foreUP (1 — golf management), NetSuite (1), HubSpot (1), AutoCAD (1), AgWare (1 — farming), Heyex 2 Vision System (2), Sidexis 4 (1 — dental), VersaCheck (1), Thompson Reuters CS Suite (1 — accounting), CCH ProSystem (1 — accounting), Fishbowl (1), Arena PLM (1 — manufacturing), SolidWorks (1 — engineering), UpdDox (1 — healthcare), Global Payment Processing OpenEdge (1)
- **Domain grouping:** 4 domains (User & Service Issues, Monitoring & NOC, Security & SOC, Business & Administrative) → maps to how we categorize standards for reporting

---

## 4. Client Base & Verticals

**40 clients across 17 verticals:**

| Vertical | Implied Tech Stack / LOB | Implied Frameworks |
|---|---|---|
| Healthcare (6) | EHR (eClinicalWorks, NexTech, Heyex2), HIPAA BAA required, UpDox | HIPAA, SOC 2 |
| Manufacturing (4) | Arena PLM, SolidWorks, Fishbowl, ERP | ISO 27001, SOC 2 |
| Legal (4) | Document management, DMS, email retention | SOC 2, data privacy |
| Construction (3) | BlueBeam, QuickBooks, project management | SOC 2 |
| Banking/Finance (3) | Core banking, payment processing, OpenEdge | PCI, SOC 2, GLBA |
| Accounting (5) | Thomson Reuters, CCH ProSystem, QuickBooks Premier Accountant | SOC 2, data privacy |
| Engineering (2) | AutoCAD, SolidWorks, Vantagepoint | SOC 2 |
| Not-for-Profit (2) | Hatch Portal, general productivity | Basic security |
| Private Club (1) | ClubTech, foreUP | PCI (payments) |
| Entertainment (1) | The Florida Orchestra | Basic security |
| Boating/Marina (1) | Marina management software | PCI |
| Farming (1) | AgWare | Basic security |
| Spa/Beauty (1) | Salon software | PCI (payments) |
| Automotive (1) | Auto shop management | PCI |
| IT Services (predictiveIT) | Full MSP stack | SOC 2, CMMC |
| Retail (1) | POS, payment processing | PCI |

---

## 5. Compliance Framework Mapping

Standards in the library should be taggable to one or more frameworks:

| Framework Tag | Applies To | LCM Source Template |
|---|---|---|
| `hipaa` | Healthcare clients, anyone handling PHI | DeepNet Foundational HIPAA |
| `soc2` | Any client pursuing SOC 2 audit | Core Alignment, Cyber Security |
| `pci` | Banking, retail, any client processing payments | PCI DSS v4.0 (322 items) |
| `nist_csf` | Government-adjacent, general best practice | NIST CSF 2.0 |
| `nist_800_171` | DoD contractors, CMMC prerequisites | NIST SP 800-171 |
| `cmmc_l1` | Light defense contractors | CMMC 2.0 Level 1 |
| `cmmc_l2` | Full defense contractors | CMMC 2.0 Level 2 |
| `cis` | General best practice baseline | CIS v8 |
| `iso27001` | Enterprise, international | ISO/IEC 27001:2022 |

---

## 6. New Module Requirements

### 6A. Standards Library (Global)
A single global library of standards, not per-client. Structure:

```
domains
  id, name, slug, description, sort_order

standard_categories  
  id, domain_id, name, description
  review_frequency_months (from MITP)
  sort_order

standards
  id, category_id
  name                    -- short title (from MITP "Question Name")
  question_text           -- full question (from MITP "Question Text")
  why_we_ask              -- rationale (from MITP "Why Are We Asking?")
  how_to                  -- assessment guidance (from MITP "How to?")
  scoring_instructions    -- brief rubric intro (from LCM)
  priority                -- high / medium / low
  is_universal            -- applies to all clients regardless of vertical/framework
  is_active
  sort_order
  source                  -- 'mitp' | 'lcm' | 'custom'

standard_framework_tags   -- many-to-many: standard ↔ framework
  standard_id, framework  -- framework: hipaa|soc2|pci|nist_csf|cmmc_l1|cmmc_l2|cis|iso27001

standard_vertical_tags    -- many-to-many: standard ↔ vertical
  standard_id, vertical   -- vertical: healthcare|banking|manufacturing|legal|etc

standard_tech_tags        -- many-to-many: standard ↔ tech/LOB
  standard_id, tech_tag   -- e.g. meraki|microsoft365|quickbooks|eclinicalworks

standard_responses        -- 5-level rubric per standard (pre-seeded from LCM)
  id, standard_id
  level                   -- satisfactory|acceptable_risk|needs_attention|at_risk|not_applicable
  label                   -- display label
  description             -- the full rubric text (from LCM)
  is_aligned              -- satisfactory/acceptable_risk = true
  color_code              -- satisfactory|acceptable_risk|needs_attention|at_risk
  sort_order
```

### 6B. Client Standard Mapping
Each client gets a set of applicable standards based on their profile:

```
client_standards
  id, client_id, standard_id
  is_applicable           -- true = in scope for this client
  applicability_source    -- 'auto_vertical' | 'auto_framework' | 'auto_tech' | 'manual'
  override_reason         -- if manually overridden
  created_at, updated_at
```

**Auto-mapping logic on client onboarding/setup:**
1. All `is_universal = true` standards → auto-included
2. Standards with matching `vertical_tag` → auto-included (vertical from AT company type)
3. Standards with matching `framework_tag` where client has that framework enabled → auto-included
4. Standards with matching `tech_tag` where client has that tech → auto-included
5. Prompt for assumed tech stack based on vertical:
   - Healthcare → "EHR system? (eClinicalWorks / Epic / Athena / NexTech)"
   - Accounting → "Tax software? (Thomson Reuters / CCH / Drake)"
   - Construction → "Estimating software? (BlueBeam / PlanSwift)"
   - Banking → "Core banking / payment processor?"

### 6C. Client Assessments (Standards-Based)
When a TAM runs a client's assessment against their mapped standards:

```
standard_assessments
  id, tenant_id, client_id
  name, status (draft|in_progress|completed)
  assessment_date, conducted_by
  overall_score, summary
  created_at, updated_at

standard_assessment_answers
  id, assessment_id, standard_id
  response_level          -- satisfactory|acceptable_risk|needs_attention|at_risk|not_applicable
  internal_notes
  public_notes
  answered_by, answered_at
```

### 6D. Third-Party Risk Assessment (TPRA) Domain
A dedicated domain in the standards library for vendor/third-party risk:

**Standards to include:**
- Vendor SOC 2 Type 2 report on file and reviewed annually
- Business Associate Agreement (BAA) / Data Processing Agreement (DPA) in place
- Vendor breach notification SLA documented (≤72 hours)
- Right-to-audit clause in contract
- Subprocessor / fourth-party visibility documented
- Data residency and sovereignty requirements met
- MFA enforced on vendor-managed access
- Vendor access limited to minimum necessary (least privilege)
- Vendor offboarding procedure documented and tested
- Vendor criticality rating assigned and reviewed annually

**Use cases:**
- **Internal TPRA:** assess our own vendors (Datto, IT Glue, SaaS Alerts, Auvik, etc.)
- **Client TPRA:** help clients assess their vendors (EHR vendors, payment processors, cloud providers)

**Framework mappings:** SOC 2 CC9.2, HIPAA BAA requirement (§164.308(b)), PCI 12.8, CMMC SR.L2-3.15.x

### 6E. Review Scheduling
Based on MITP's per-category review frequency:
- Standards grouped by frequency bucket: monthly / quarterly / semi-annual / annual
- When an assessment is completed, schedule next review date per category
- TAM dashboard shows overdue/upcoming standard reviews per client

### 6F. Roadmap Integration
Misaligned answers (needs_attention, at_risk) in a standards-based assessment should auto-generate recommendation drafts:
- Linked to the standard (with `standard_id`)
- Pre-populated from `how_to` field
- Priority from standard's `priority` field
- Grouped into the existing roadmap by category/domain

---

## 7. UX / Workflow Requirements

### Standards Library Admin (global_admin / tenant_admin)
- Browse standards by Domain → Category → Standard
- Filter by framework tag, vertical tag, priority, universal flag
- Edit any standard's text, rubric levels, tags
- Import from CSV (LCM format) or XLSX (MITP format)
- Mark standards inactive (hide from assessments without deleting)

### Client Setup / Onboarding (vcio / tam)
- Set client vertical (sync from AT or manual)
- Enable applicable compliance frameworks for client
- Tag client's known tech stack / LOB apps
- Review auto-mapped standards, manually override any
- See count: "142 universal + 38 healthcare + 22 HIPAA = 202 standards in scope"

### TAM Assessment Workflow (tam / vcio)
- Select client → see their applicable standards organized by Domain → Category
- Answer each standard (5-level response picker)
- Add internal notes (not client-visible) and public notes (client-visible)
- Save progress, resume later
- Complete → generate score, update client health score, schedule next reviews
- Show previous answer alongside current (comparison mode)

### vCIO Reporting
- Client alignment score by domain, framework, vertical
- Framework gap report: "of 73 HIPAA standards, 18 are at-risk or needs-attention"
- TPRA vendor list with risk ratings
- Trend over time (previous vs current assessment)
- Export to PDF for client presentations

---

## 8. Import / Seed Plan

### Phase 1 — Seed from LCM templates
- Parse all 37 CSVs
- De-duplicate standards that appear in multiple templates
- Map each to appropriate Domain → Category
- Import 5-level rubric text as `standard_responses`
- Tag with framework based on source template (e.g., HIPAA CSV → `hipaa` tag)

### Phase 2 — Enrich from MITP
- Match MITP questions to LCM standards by name/category similarity
- Merge in `why_we_ask`, `how_to`, `priority`, `review_frequency`
- Add MITP-only standards not present in LCM

### Phase 3 — Client mapping
- For each existing client, run auto-mapping based on vertical + enabled frameworks
- Present for TAM/vCIO review before activating

---

## 9. Domain Structure Proposal (for AI to refine)

Proposed top-level domains for the standards library:

1. **Endpoint & Device** — workstations, laptops, mobile, printers, IoT
2. **Network & Connectivity** — firewall, switching, wireless, ISP, VPN, segmentation
3. **Server & Infrastructure** — physical/virtual servers, storage, hypervisor, AD/Entra
4. **Identity & Access** — IAM, MFA, privileged access, SSO, offboarding
5. **Security Operations** — EDR, SIEM, patching, vulnerability management, incident response
6. **Backup & Disaster Recovery** — backup strategy, immutability, testing, RTO/RPO
7. **Cloud & M365** — Microsoft 365, Azure AD, cloud apps, SaaS governance
8. **Compliance & Policy** — written policies, training, audits, regulatory compliance
9. **Physical Security** — server room, access control, environmental
10. **Business Continuity** — BCP/DR planning, tabletop exercises, critical systems
11. **Third-Party Risk** — vendor assessment, contracts, BAAs, subprocessors
12. **Line of Business** — LOB app security, support contracts, version currency

---

## 10. Open Design Questions for AI Input

1. **Domain structure** — Is the 12-domain list above the right level of granularity, or should some be merged/split? Consider: ~415 total standards, ~62 categories from MITP.

2. **De-duplication strategy** — LCM has 37 templates with significant overlap (e.g., "Firewall Warranty" appears in 6+ templates). How should we handle merging — pick one canonical standard, or keep variants with a "source" tag?

3. **Universal vs. tagged** — What standards should truly be universal (apply to every client regardless of vertical/size)? Suggest a universal baseline subset.

4. **Review frequency model** — MITP defines frequency per category. Should we schedule per-category (all standards in "Firewall" reviewed every 2 months), or allow per-standard frequency override?

5. **TPRA data model** — Should TPRA be its own assessment type (separate workflow: select a vendor, run TPRA) or just a domain within a standard client assessment? Consider that the subject is a vendor, not a client.

6. **Migration from template system** — Existing assessments use `template_items` and `template_item_responses`. Should existing template-based assessments remain as-is, or should we migrate them to point at `standards` from the library? Suggest a coexistence model.

7. **Scoring** — Current system uses section/item weights for a 0–100 overall score. For the standards library, weights would come from priority (High=3, Medium=2, Low=1) and domain weight. Recommend a scoring formula that is transparent and explainable to clients.

8. **Client tech stack** — Best UX for capturing a client's tech stack during onboarding (single-select per category? freeform tags? searchable from a pre-built list from the LOB inventory?).

9. **Framework gap report** — For a client with HIPAA enabled, we want to show which specific standards are misaligned. Should this be a standalone report or integrated into the assessment view?

10. **Business alignment standards** — Should the library include business/operational standards (e.g., "IT budget as % of revenue", "Executive sponsor engagement", "IT steering committee") or keep it purely technical? myitprocess does include business alignment.

---

## 11. Tech Stack Context

- **Backend:** Node.js / Express, PostgreSQL (pg)
- **Frontend:** React, Tailwind CSS, Recharts, Lucide icons
- **Auth:** JWT, multi-tenant (tenant_id on all tables)
- **Existing patterns:** RESTful API, `requireAuth` + `requireRole` middleware, pagination, filter params

---

## 12. Summary Ask

Design the complete TAM Standards Library module including:
1. Finalized database schema (DDL)
2. Refined domain/category structure that consolidates the 62 MITP categories + 213 LCM categories
3. Import script logic for LCM CSVs and MITP XLSX
4. Client standard mapping model and auto-mapping logic
5. TPRA as a separate workflow vs. integrated domain — recommendation with rationale
6. API endpoint list (REST)
7. React component structure for Standards Library, Client Setup, Assessment, and Reporting views
8. Scoring formula recommendation


---

## 13. Standard Delivery Method Classification

Each standard in the library should be tagged with how it can be assessed:

```
standards.delivery_method  -- enum: automated | remote_human | onsite_required | hybrid
```

| Value | Meaning | Examples |
|---|---|---|
| `automated` | Can be verified via RMM/API without human intervention | Backup success rate (Datto), device offline status, BitLocker status (RMM script), patch compliance %, AV health |
| `remote_human` | TAM can assess remotely via screen share, admin console, or documentation review | Firewall rule review, AD admin account audit, MFA configuration, M365 license review |
| `onsite_required` | Physical presence required to verify | Server room cleanliness, cabling, UPS physical connections, asset tag verification, physical access controls |
| `hybrid` | Partial automation + human review | Firewall firmware (RMM can check version, human verifies subscription status) |

### Integration with Datto RMM / Existing APIs
Standards tagged `automated` should link to the specific data source:

```
standard_automation_sources
  standard_id
  source_platform   -- 'datto_rmm' | 'autotask' | 'itglue' | 'scalepad' | 'saas_alerts' | 'auvik'
  data_field        -- the specific field/metric that answers this standard
  pass_condition    -- logic that determines satisfactory vs at_risk
```

Examples:
- "Backup Success Rate" → Datto RMM → backup job status → pass if >95% last 30 days
- "Device Lifecycle" → ScalePad → warranty_end_date → at_risk if EOL, needs_attention if <12mo
- "AV/EDR Health" → Datto RMM → antivirus_status → at_risk if NOTRUNNING
- "MFA Enrollment" → SaaS Alerts / M365 → mfa_enabled per user → needs_attention if <100%

### LCM TAM Monthly Template Delivery Context
LCM already labels each monthly template as "(Remote)" or "(Onsite)" — this maps directly:
- January through May, July, August, October, November, December → `remote_human`
- June (Physical Infrastructure) → `onsite_required`
- September (Physical Security) → `onsite_required`

### UX Impact
- Assessment view shows delivery method badge per standard
- Filter by delivery method (TAM planning: "show me only onsite items for scheduling")
- Automated standards auto-populate from API on assessment start (no manual entry needed)
- Dashboard: "X standards can be auto-checked — run now" button


---

## 14. Methodology & Content Standards (from ChatGPT Project Instructions)

### Conceptual Framework
Based on **TruMethods Technology and Standards Alignment**. The goal of every standard is to:
- Reduce risk
- Improve productivity
- Reduce threat surface
- Harden the client environment
- Reduce reactive support tickets

### Naming Convention
```
Assessment Name  = top-level category (e.g., "Perimeter Security")
Category         = subcategory, using hyphens for sub-subcategories
                   e.g., "Firewall - Administration", "Firewall - Rule Sets"
Item             = the actual question/standard
                   e.g., "Is management access limited to only trusted networks?"
```

### Review Types
1. **Onboarding Review** — comprehensive, run once when a new client joins. Goal: identify all misalignments, assign priority, generate remediation recommendations.
2. **Monthly Review** — focused on critical checks + newly identified risks or best practice changes (e.g., a new M365 feature release that requires a new standard).

### Priority System (for misaligned findings)
| Priority | Remediation Window |
|---|---|
| High | Immediate to 30 days |
| Medium | 30–60 days |
| Low | 90+ days |

### Identity Management Assumption
All standards assume the client standardizes on a **single identity and access management system**:
- Azure AD (Entra ID) — direct cloud only
- Google Workspace — direct cloud only
- Hybrid sync — local Windows domain + Azure AD or Google Workspace

Every IAM-related standard should be written with these three scenarios in mind.

### Standard Content Structure (Explanation/Remediation field)
Each standard must include all of the following in its `explanation` / `how_to` / `remediation` content:

1. **Brief explanation** — what this standard is and why it exists
2. **How to check** — specific steps to verify compliance (admin console location, PowerShell command, RMM check, etc.)
3. **Remediation recommendation** — specific steps to fix if misaligned
4. **Technical rationale** (internal/TAM audience) — the technical reason this standard matters
5. **Business impact** (client/non-technical audience) — framed around productivity, security outcomes, and reducing reactive tickets. Assume the client always wants to be more productive, more secure, and have fewer support tickets.

### Compliance Framework Tags
Every standard is tagged with applicable compliance frameworks. These are metadata (not part of the LCM import, stored as separate DB columns/tags):
- `hipaa` — HIPAA
- `pci` — PCI DSS
- `cmmc2` — CMMC 2.0
- `soc2` — SOC 2 Type 2
- `cis` — CIS Hardening

### Level / Tier System
Standards are tiered by complexity and compliance requirement. Tag stored at bottom of explanation field and in separate DB column:
| Level | Meaning |
|---|---|
| Level 1 | Core / minimum standard — baseline every client must meet |
| Level 2 | Intermediate — recommended for most clients, required for some compliance frameworks |
| Level 3 | Advanced — complex to implement, required for higher-level compliance (CMMC L2, SOC 2, etc.) |

### End User Impact Tags
Each standard tagged with expected impact on end users during remediation (separate DB column):
- `no_user_impact` — can be done silently, no user disruption
- `minimum_user_impact` — minor change, minimal disruption
- `significant_user_impact` — behavioral change required, user communication/training needed

### Automation Tags (separate DB column)
- `automated` — can be checked and/or remediated via RMM script, API, or PowerShell without human intervention
- `manual` — requires human review or action
- `hybrid` — partial automation possible (check automated, remediation manual)

**Ultimate goal:** All `automated` standards should have accompanying PowerShell / RMM scripts for both assessment (check) and remediation, executable via Datto RMM component library.

### Output Format
When generating standards content, always produce output compatible with ScalePad Lifecycle Insights (LCI) `assessment_upload_template.csv` format:
- assessment_name, category, item, scoring_instructions, explanation, not_applicable_response, unknown_response, at_risk_response, needs_attention_response, acceptable_risk_response, satisfactory_response
- Plus additional non-import columns: compliance_tags, level_tier, user_impact, automation_tag


---

## 15. Current Platform Discovery — Full Schema & Feature State

> This section was generated by inspecting the live codebase and database. Use it to ensure the TAM module design extends cleanly without DDL conflicts or pattern deviations.

---

### 15A. Database Conventions

| Pattern | Value |
|---|---|
| Primary keys | `uuid` with `DEFAULT gen_random_uuid()` on ALL tables |
| Tenant scoping | `tenant_id uuid NOT NULL` on every major table, FK → `tenants.id` |
| Timestamps | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` on all mutable tables |
| Soft delete | `is_active boolean NOT NULL DEFAULT true` (no hard delete pattern — just flag) |
| External sync | `external_id text`, `external_source sync_source_type enum`, `metadata jsonb DEFAULT '{}'`, `last_synced_at timestamptz` on synced tables |
| Enum definition | Defined as PostgreSQL ENUMs (not app-layer strings) for all status/role/type fields |
| API prefix | `/api/` (no version prefix — e.g., `/api/standards`, `/api/assessments`) |
| Pagination | Not currently implemented — all list endpoints return full result sets |
| Filter params | Query string: `?category_id=`, `?status=`, `?search=`, `?client_id=` |

---

### 15B. Standards Library — Current State

**Three-level hierarchy already exists:**
```
standard_sections   →  standard_categories  →  standards
(Section/Domain)       (Category)               (Individual standard)
```

**`standard_sections`** (8 rows, tenant-scoped):
| Name | Description |
|---|---|
| Endpoint Management | Workstations, laptops, mobile devices, endpoint security |
| Network Infrastructure | Firewalls, switches, wireless, connectivity |
| Security & Compliance | Cybersecurity controls, policies, compliance frameworks |
| Cloud & Applications | Cloud services, SaaS, business applications |
| Business Continuity | Backup, disaster recovery, BCP |
| Identity & Access | AD, Azure AD, MFA, access management |
| Communication & Collaboration | Email, Teams, VoIP, collaboration |
| Onboarding & Discovery | New client discovery and onboarding standards |

**`standard_sections` schema:**
```sql
id uuid PK, tenant_id uuid NOT NULL, name text NOT NULL,
description text, sort_order int DEFAULT 0, created_at timestamptz
```

**`standard_categories`** (12 rows, NOT yet linked to sections — `section_id` is NULL on all):
General, Lifecycle Management, Security, Networking, Endpoint Management, Server & Infrastructure, Cloud & SaaS, Backup & DR, Email & Communication, Documentation, Compliance, End User Experience

**`standard_categories` schema:**
```sql
id uuid PK, tenant_id uuid NOT NULL, name text NOT NULL,
description text, icon text, sort_order int NOT NULL DEFAULT 0,
is_active boolean NOT NULL DEFAULT true,
created_at timestamptz, updated_at timestamptz,
section_id uuid REFERENCES standard_sections(id)   -- currently NULL on all rows
```

**`standards` schema (full):**
```sql
id uuid PK
tenant_id uuid NOT NULL REFERENCES tenants(id)
category_id uuid NOT NULL REFERENCES standard_categories(id)
name text NOT NULL
description text                          -- long description / question text
criteria text                             -- assessment criteria
remediation_guidance text                 -- remediation steps
severity_weight numeric NOT NULL DEFAULT 1.0
is_active boolean NOT NULL DEFAULT true
sort_order integer NOT NULL DEFAULT 0
external_id text                          -- for MyITProcess sync
external_source sync_source_type          -- 'myitprocess' etc
metadata jsonb NOT NULL DEFAULT '{}'
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
status text DEFAULT 'approved'            -- 'draft' | 'approved' (app-layer string, not enum)
created_by text                           -- display name string (not FK)
how_to_find text                          -- how to assess/verify
why_we_ask text                           -- rationale for internal team
why_we_ask_client_visible boolean DEFAULT false
review_frequency text DEFAULT 'never'     -- 'monthly'|'quarterly'|'biannual'|'annually'|'never'
last_reviewed_at timestamptz
next_review_due timestamptz
tags text[] DEFAULT '{}'                  -- currently empty on all 140 standards
```

**Current standards count:** 140 (139 approved, 1 draft). Tags array is empty on all — not yet used.

**Key gap:** `standards` table has NO columns for:
- `priority` (high/medium/low)
- `is_universal` flag
- `level_tier` (1/2/3)
- `delivery_method` (automated/remote_human/onsite_required/hybrid)
- `user_impact` tag
- `question_text` (separate from `description`)
- Framework tags (currently only in `tags[]` array, but unused)
- Vertical tags
- Tech stack tags

**Current `standards.status` values:** `'draft'` | `'approved'` — plain text strings, not a DB enum.

---

### 15C. Assessment Templates — Current State

**`assessment_templates` schema:**
```sql
id uuid PK, tenant_id uuid NOT NULL, name text NOT NULL,
description text, is_active boolean NOT NULL DEFAULT true,
is_default boolean NOT NULL DEFAULT false,
created_by uuid REFERENCES users(id),
created_at timestamptz, updated_at timestamptz
```

**`template_sections` schema:**
```sql
id uuid PK, template_id uuid NOT NULL REFERENCES assessment_templates(id),
name text NOT NULL, description text,
weight numeric NOT NULL DEFAULT 0,    -- section weight for scoring
sort_order int NOT NULL DEFAULT 0, created_at timestamptz, updated_at timestamptz
```

**`template_items` schema:**
```sql
id uuid PK
section_id uuid NOT NULL REFERENCES template_sections(id)
template_id uuid NOT NULL REFERENCES assessment_templates(id)
title text NOT NULL
description text
item_type template_item_type NOT NULL DEFAULT 'multi_response'  -- enum: yes_no | multi_response
weight numeric NOT NULL DEFAULT 0     -- item weight for scoring
scoring_instructions text
remediation_tips text
sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
created_at timestamptz, updated_at timestamptz
standard_id uuid REFERENCES standards(id)   -- FK to standards library (can be NULL)
```

**`template_item_responses` schema:**
```sql
id uuid PK
item_id uuid NOT NULL REFERENCES template_items(id)
label text NOT NULL
color_code response_color NOT NULL DEFAULT 'satisfactory'
  -- enum: at_risk | needs_attention | satisfactory | not_applicable | acceptable_risk
description text            -- pre-written rubric text (166 were populated via script)
sort_order int NOT NULL DEFAULT 0
is_aligned boolean NOT NULL DEFAULT false
  -- satisfactory=true, not_applicable=true, acceptable_risk=true, at_risk=false, needs_attention=false
created_at timestamptz
```

**Standard ↔ Template linkage:** `template_items.standard_id` FK exists. A template item CAN point to a standard, but doesn't have to. This is the bridge between the old template system and the new standards library.

---

### 15D. Assessments & Answers — Current State

**`assessments` schema:**
```sql
id uuid PK, tenant_id uuid NOT NULL, client_id uuid NOT NULL,
conducted_by uuid REFERENCES users(id),
name text NOT NULL, assessment_date date NOT NULL DEFAULT CURRENT_DATE,
overall_score numeric,    -- computed on /complete, stored here
summary text, status text NOT NULL DEFAULT 'draft'  -- draft|in_progress|completed
external_id text, external_source sync_source_type,
metadata jsonb, last_synced_at timestamptz,
created_at timestamptz, updated_at timestamptz,
template_id uuid REFERENCES assessment_templates(id)
```

**`assessment_answers` schema:**
```sql
id uuid PK
assessment_id uuid NOT NULL REFERENCES assessments(id)
item_id uuid NOT NULL REFERENCES template_items(id)  -- points to template_items
response_id uuid REFERENCES template_item_responses(id)
internal_notes text      -- TAM notes, not client-visible
public_notes text        -- shown to client
vcio_notes text          -- vCIO business analysis layer (currently unused)
answered_by uuid REFERENCES users(id)
answered_at timestamptz
created_at timestamptz, updated_at timestamptz
```

**Scoring formula (from `/api/assessments/:id/complete`):**
```
colorScore = { satisfactory: 100, acceptable_risk: 80, needs_attention: 40, at_risk: 0, not_applicable: null }
combinedWeight = section_weight * item_weight
weightedScore += combinedWeight * colorScore[color_code]   (not_applicable items excluded)
overall_score = round(weightedScore / totalWeight)         → stored on assessments + clients.health_score
```

**Second scoring path (for `assessment_items` / standards-based):**
```
scoreMap = { aligned: 100, marginal: 60, vulnerable: 30, highly_vulnerable: 0 }
avgScore = simple average of all item scores (no weighting)
```

---

### 15E. Standards-Based Assessment — Partially Scaffolded

**`assessment_items` table EXISTS (separate from `assessment_answers`):**
```sql
id uuid PK
assessment_id uuid NOT NULL REFERENCES assessments(id)
standard_id uuid NOT NULL REFERENCES standards(id)   -- direct standard reference
severity alignment_severity NOT NULL DEFAULT 'not_assessed'
  -- enum: aligned | marginal | vulnerable | highly_vulnerable | not_assessed
score numeric
notes text
evidence text
external_id text, external_source sync_source_type, metadata jsonb
created_at timestamptz, updated_at timestamptz
```

**This means:** The DB already supports two parallel assessment answer models:
1. `assessment_answers` → `template_items` → `template_item_responses` (existing template system, 5-level rubric)
2. `assessment_items` → `standards` with `alignment_severity` enum (standards-based system, partially built)

**`recommendations` links to BOTH:**
- `assessment_answer_id uuid REFERENCES assessment_answers(id)` — template-based
- `assessment_item_id uuid REFERENCES assessment_items(id)` — standards-based

---

### 15F. Recommendations & Roadmap — Full Schema

```sql
recommendations:
  id uuid PK, tenant_id uuid NOT NULL, client_id uuid NOT NULL
  assessment_item_id uuid REFERENCES assessment_items(id)      -- standards-based link
  assessment_answer_id uuid REFERENCES assessment_answers(id)  -- template-based link
  title text NOT NULL, description text, executive_summary text
  priority recommendation_priority NOT NULL DEFAULT 'medium'
    -- enum: critical | high | medium | low | informational
  type text NOT NULL DEFAULT 'improvement'
  status recommendation_status NOT NULL DEFAULT 'draft'
    -- enum: draft | proposed | approved | in_progress | completed | deferred | declined
  kind text NOT NULL DEFAULT 'recommendation'   -- 'recommendation' | 'initiative'
  estimated_budget numeric, estimated_hours numeric
  responsible_party text, assigned_to uuid REFERENCES users(id)
  target_date date, completed_date date
  schedule_year integer, schedule_quarter integer
  at_ticket_id bigint, at_ticket_number integer, at_ticket_title text
  at_opportunity_id bigint, at_opportunity_number integer, at_opportunity_title text
  external_id text, external_source, metadata jsonb, last_synced_at timestamptz
  created_at timestamptz, updated_at timestamptz
```

**Junction tables linking recommendations to other entities:**
- `initiative_recommendations` (initiative_id, recommendation_id, sort_order)
- `goal_initiatives` (goal_id, recommendation_id) — naming is misleading; links goals to recs
- `recommendation_action_items` (sub-tasks within a recommendation)
- `recommendation_budget_items` (line-item budgets per recommendation)
- `recommendation_assets` (affected assets)
- `meeting_agenda_items.recommendation_id` (recommendations surfaced in meetings)

---

### 15G. Client Profile — Current State

**`clients` schema (relevant columns):**
```sql
id uuid PK, tenant_id uuid NOT NULL
autotask_company_id bigint        -- AT sync key
name text NOT NULL, short_name text
industry text                     -- currently NULL for all clients (AT field, not populated)
account_type text                 -- 'Customer' (from AT)
classification text DEFAULT 'managed'
health_score numeric              -- updated on assessment completion
assigned_vcio_id uuid, assigned_tam_id uuid
parent_client_id uuid             -- for subsidiary clients
metadata jsonb                    -- contains full AT company record incl. marketSegmentID
```

**Critical gap:** No columns for:
- `vertical` (structured vertical tag — different from AT's `industry` which is null)
- `frameworks_enabled` (which compliance frameworks apply: HIPAA, PCI, etc.)
- `tech_stack` / `lob_apps` (known tech/LOB applications)
- `infrastructure_model` (M365 vs Google Workspace vs hybrid)
- `identity_platform` (Azure AD / Google / hybrid-AD)

These will need to be added as new columns or a `client_profile` table for the TAM auto-mapping to work.

---

### 15H. Frontend Patterns

**Component structure:**
```
client/src/
  App.jsx                    — routing (React Router)
  main.jsx                   — entry point
  hooks/
    useAuth.jsx              — auth context hook (no Redux/Zustand — hooks only)
  components/
    Layout.jsx               — shell with Sidebar
    Sidebar.jsx              — navigation
    RecEditModal.jsx         — recommendation edit modal (shared)
    AssetModal.jsx, ContactModal.jsx, DrillDownModal.jsx
    AlignmentBadge.jsx, Card.jsx, PageHeader.jsx, StatCard.jsx
    HardwareTable.jsx
  pages/
    Standards.jsx            — standards library browser
    AssessmentDetail.jsx     — assessment runner (full rewrite completed)
    Assessments.jsx          — assessment list
    ClientDetail.jsx         — client detail with tabs incl. RoadmapTab
    ClientList.jsx, ClientMapping.jsx
    Recommendations.jsx, RecommendationDetail.jsx
    Assets.jsx, Budget.jsx, ClientBudget.jsx
    Dashboard.jsx, Roadmap.jsx, SaasLicenses.jsx
    Settings.jsx, TemplateDetail.jsx
```

**Key patterns:**
- **State:** React hooks only — no Redux, no Zustand, no React Query
- **HTTP:** `axios` instance aliased as `api` with base URL + auth header injection
- **Modals:** No shared Modal wrapper — each modal is a self-contained component
- **Charts:** Recharts (confirmed)
- **Icons:** Lucide React
- **Rich text display:** HTML rendered via `dangerouslySetInnerHTML` (MITP question text contains `<p>` tags)
- **Styling:** Tailwind CSS utility classes throughout

---

### 15I. API Routes — Complete Map

**Prefix:** `/api/` (no version)

| Mount | Route File |
|---|---|
| `/api/standards` | standards.js — sections, categories, standards CRUD + review workflow |
| `/api/assessments` | assessments.js — assessments, answers, comparison, complete |
| `/api/templates` | templates.js — template CRUD + items + responses |
| `/api/recommendations` | recommendations.js — recs CRUD + AT ticket/opp + goals link |
| `/api/clients` | clients.js — client CRUD + contacts + action items + goals |
| `/api/goals` | goals.js — goals CRUD |
| `/api/initiatives` | initiatives.js — initiatives CRUD + budget + assets + action items |
| `/api/eos` | eos.js — rocks, scorecard, todos, issues |
| `/api/assets` | assets.js — hardware assets + lifecycle |
| `/api/sync` | sync.js — integration sync triggers |
| `/api/integrations` | integrations.js — integration config + client mapping |
| `/api/saas-licenses` | saas-licenses.js |
| `/api/budget` | budget.js |
| `/api/action-items` | actionItems.js |
| `/api/auth` | auth.js — login, SSO (Microsoft/Google), me, logout |
| `/api/contacts` | contacts.js |
| `/api/settings` | settings.js |
| `/api/users` | users.js |
| `/api/software` | software.js |
| `/api/csat` | csat.js |
| `/api/feedback` | feedback.js |
| `/api/warranty-lookup` | warrantyLookup.js |
| `/api/health` | health.js |

**Tenant resolution:** `tenantMiddleware` runs on all `/api/` routes — resolves `req.tenant` from subdomain or JWT before routes execute. All queries filter by `req.tenant.id`.

---

### 15J. Key Design Decisions for Opus

Based on the discovery above, the TAM module design should address:

1. **`assessment_items` already exists** — the standards-based assessment table is partially scaffolded. The new TAM module should USE this table, not create a new one. However, its severity model (`aligned/marginal/vulnerable/highly_vulnerable`) conflicts with the 5-level rubric model from LCM. Resolution needed.

2. **`standard_sections` already exists** with 8 rows that mostly align with our proposed 12 domains. The TAM design should reconcile/extend these rather than create a parallel structure.

3. **`standard_categories.section_id` is NULL on all 12 rows** — the category → section linkage is broken/unused. Fixing this is prerequisite to the domain→category hierarchy working.

4. **`standards.tags[]` exists but is empty** — framework, vertical, and tech stack tags should use this array column OR new junction tables. Array is simpler but less queryable; junction tables are more relational.

5. **`clients` has no vertical/framework/tech columns** — need `ALTER TABLE clients ADD COLUMN vertical text, frameworks_enabled text[] DEFAULT '{}', identity_platform text, lob_apps text[] DEFAULT '{}'` or a separate `client_profile` table.

6. **Two scoring models coexist** — template-based (weighted section×item×color) and standards-based (simple average of severity scores). The new TAM module scoring should align with or supersede the standards-based model.

7. **`template_items.standard_id`** — existing template items CAN reference standards. Migration path: link existing template items to new standards library records, enabling the old template assessments to contribute to framework gap reports.

