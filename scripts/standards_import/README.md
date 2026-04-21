# Standards Import Pipeline (MyITProcess → Align)

One-off import pipeline used to bring ~1,800 MyITProcess questions into the Align
standards library as master controls + framework tags.

Source file: `/tmp/Updated StandardsLibrary.xlsx` (317KB MyITProcess export,
20 sections / 313 categories / 1,865 questions).

## Result (committed 2026-04-21)

- **1,387 new master standards** imported as `status='draft'` after 95% dedup
- **1,136 framework tags** linking standards to 7 frameworks
  (ISO 27001:2022, NIST 800-171 R2, NIST CSF 2.0, PCI-DSS 4.0.1, CMMC L1/L2, HIPAA)
- **4,376 responses** (compact — 3/4/5 levels depending on control type)
- **8 cross-framework merges** into existing approved standards so the same answer
  satisfies multiple frameworks

## Stage flow

| # | Script                        | Role                                              |
|---|-------------------------------|---------------------------------------------------|
| 1 | `01_extract_and_cluster.py`   | Parse XLSX, initial 95% cluster (first try)       |
| 2 | `02_cluster_v2.py`            | Name-aware cluster (avoids false merges on PCI #) |
| 3 | `03_generate_and_import.py`   | Build master dicts with responses + evidence      |
| 4 | `04_import_to_db.js`          | Insert standards + framework_tags + responses     |
| 5 | `05_classify_binary.py`       | Classify binary/ternary/graded/informational      |
| 6 | `06_apply_response_modes.js`  | Regenerate responses per mode (6,935 → 4,376)     |
| 7 | `07_second_pass_dedup.py`     | Find dups vs existing 134 standards (75%+)        |
| 8 | `08_execute_merges.js`        | Execute the 1 very-likely merge                   |
| 9 | `09_execute_batch_merges.js`  | Execute the 7 probable-tier merges                |

## Running any stage

Most scripts expect `PGHOST=10.168.2.46 PGPASSWORD=...` for the Align DB. Node
scripts `require` `/opt/align/src/db` directly. Python scripts shell out to
node helpers to query the DB.

```bash
cd /opt/align/scripts/standards_import
python3 02_cluster_v2.py      # re-cluster if spreadsheet changes
node 04_import_to_db.js       # re-import (idempotent — uses import_row_id)
```

## Re-running with a new spreadsheet

1. Replace `/tmp/Updated StandardsLibrary.xlsx` with the new export
2. Run stages 2 → 3 → 4 → 5 → 6 in order
3. For new dedup candidates: 7 → curate merges → add to a new batch script
4. Approve drafts in the Standards page UI (global_admin / tenant_admin)

## Schema additions (already applied, migrations in `/opt/align/src/migrations`)

- `standards.evidence_examples text[]`
- `standards.import_source text` / `standards.import_row_id text`
- `standards.response_mode text` (binary/ternary/graded/informational)
- `standard_framework_tags.framework_evidence text`
- `standard_framework_tags` unique `(standard_id, framework)`
- `standard_sections` unique `(tenant_id, name)`
- `standard_categories` unique `(tenant_id, section_id, name)`
- `assessment_type` enum: `framework_gap` added
