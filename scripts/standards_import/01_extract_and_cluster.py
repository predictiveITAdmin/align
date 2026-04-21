#!/usr/bin/env python3
"""
Extract all questions from the MyITProcess spreadsheet, normalize them,
cluster by similarity at 95% threshold, and produce a merge report.

Also matches against existing Align standards (pulled via DB).
"""
import openpyxl
import json
import re
import os
import sys
import subprocess
from collections import defaultdict
from rapidfuzz import fuzz, process

INPUT = '/tmp/Updated StandardsLibrary.xlsx'
OUT_DIR = '/tmp/standards_import'
os.makedirs(OUT_DIR, exist_ok=True)

# ───────────────────────────────────────────────────────────────────────
# Framework mapping: spreadsheet section name → canonical framework code
# ───────────────────────────────────────────────────────────────────────
FRAMEWORK_MAP = {
    'Onboarding Discovery':                                      None,  # operational
    'Core Infrastructure':                                       None,
    'Server Infrastructure':                                     None,
    'Server Room/Data Center':                                   None,
    'Hardware':                                                  None,
    'Software':                                                  None,
    'Business Continuity':                                       None,
    'Contingency Planning & Business Continuity':                None,  # operational BCP content
    'NIST 800-171 rev 2':                                        'NIST-800-171-R2',
    'NIST CSF 2.0':                                              'NIST-CSF-2',
    'ISO 27001 : 2022':                                          'ISO-27001-2022',
    'PCI - DSS SAQ C 4.0.1':                                     'PCI-DSS-4',
    'CMMC Level 2 - Version 2.13 (NIST SP 800-171 Rev. 2)':      'CMMC-L2',
    'CMMC Level 1 - FAR Clause 52.204-21':                       'CMMC-L1',
    'Cybersecurity Practices for Small Health Care Organizations':  'HIPAA',
    'Cybersecurity Practices for Medium Health Care Organizations': 'HIPAA',
    'Cybersecurity Practices for Large Health Care Organizations':  'HIPAA',
    'Cybersecurity':                                             None,  # empty
    'Regularory Compliance':                                     None,  # empty
}

# Sections to SKIP entirely (empty or irrelevant)
SKIP_SECTIONS = {'Cybersecurity', 'Regularory Compliance'}

# ───────────────────────────────────────────────────────────────────────
# Text normalization
# ───────────────────────────────────────────────────────────────────────
QUESTION_PREFIXES = [
    r'^does the organization\s+',
    r'^do the\s+',
    r'^do all\s+',
    r'^does the customer\s+',
    r'^are all\s+',
    r'^is the\s+',
    r'^are the\s+',
    r'^do we\s+',
    r'^is there\s+',
    r'^are there\s+',
    r'^has the organization\s+',
    r'^have all\s+',
    r'^mechanisms exist to\s+',
]

def normalize(text):
    if not text:
        return ''
    t = text.lower().strip()
    # Strip common prefixes
    for pat in QUESTION_PREFIXES:
        t = re.sub(pat, '', t)
    # Collapse whitespace
    t = re.sub(r'\s+', ' ', t)
    # Remove trailing punctuation
    t = t.rstrip('?!.,;:')
    # Remove special chars
    t = re.sub(r'[^\w\s-]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


# ───────────────────────────────────────────────────────────────────────
# Load existing Align standards from DB
# ───────────────────────────────────────────────────────────────────────
def load_existing_standards():
    """Query the Align DB for existing standards via node script."""
    cmd = ['node', '-e', '''
        process.env.PGHOST="10.168.2.46";
        process.env.PGPASSWORD="7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e";
        const db = require("/opt/align/src/db");
        (async () => {
          const r = await db.query(`
            SELECT s.id, s.name, s.question_text, s.description, sc.name AS category_name, ss.name AS section_name
            FROM standards s
            JOIN standard_categories sc ON sc.id = s.category_id
            LEFT JOIN standard_sections ss ON ss.id = sc.section_id
            WHERE s.is_active = true AND s.status = \\'approved\\'
          `);
          console.log(JSON.stringify(r.rows));
          process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    ''']
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/align')
    if result.returncode != 0:
        print(f'[ERROR] loading existing: {result.stderr}', file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout.strip())


# ───────────────────────────────────────────────────────────────────────
# Extract all questions
# ───────────────────────────────────────────────────────────────────────
def extract_questions():
    wb = openpyxl.load_workbook(INPUT, data_only=True)
    ws = wb['Template']

    questions = []
    current_section = None
    current_category = None

    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        rtype = (row[1] or '').strip()
        name = row[2]
        if rtype == 'Section':
            current_section = name
            current_category = None
        elif rtype == 'Category':
            current_category = name
        elif rtype == 'Question':
            if current_section in SKIP_SECTIONS:
                continue
            questions.append({
                'row_id': row[0],
                'row_num': idx,
                'section': current_section,
                'category': current_category,
                'name': name or '',
                'priority': (row[5] or 'Medium').strip(),
                'question_text': (row[6] or '').strip(),
                'why': (row[7] or '').strip(),
                'how': (row[8] or '').strip(),
                'framework': FRAMEWORK_MAP.get(current_section),
                # Normalized forms for dedup
                'norm_name': normalize(name),
                'norm_question': normalize(row[6] or ''),
            })
    return questions


# ───────────────────────────────────────────────────────────────────────
# Cluster using rapidfuzz
# ───────────────────────────────────────────────────────────────────────
def cluster(questions, threshold=95):
    """
    Cluster questions into groups where members are >=threshold similar.
    Uses both the normalized NAME and the normalized QUESTION for matching.
    Returns list of clusters; each cluster is a list of question dicts.
    """
    # Build a combined signature for each question (name + question text, normalized)
    signatures = []
    for q in questions:
        sig = q['norm_name']
        if q['norm_question'] and q['norm_question'] != q['norm_name']:
            sig = f"{q['norm_name']} | {q['norm_question']}"
        signatures.append(sig)

    # Cluster via greedy matching
    clusters = []
    assigned = [False] * len(questions)

    for i in range(len(questions)):
        if assigned[i]:
            continue
        cluster = [i]
        assigned[i] = True

        # Find all others matching this one at >=threshold
        # Use rapidfuzz.process.extract for speed
        for j in range(i + 1, len(questions)):
            if assigned[j]:
                continue
            # Use token_set_ratio for robust matching across minor word reorderings
            score = fuzz.token_set_ratio(signatures[i], signatures[j])
            if score >= threshold:
                cluster.append(j)
                assigned[j] = True

        clusters.append([questions[idx] for idx in cluster])

    return clusters


# ───────────────────────────────────────────────────────────────────────
# Match clusters against existing Align standards
# ───────────────────────────────────────────────────────────────────────
def match_existing(clusters, existing, threshold=95):
    """For each cluster, check if it matches an existing Align standard."""
    existing_sigs = []
    for ex in existing:
        nm = normalize(ex.get('name') or '')
        qt = normalize(ex.get('question_text') or '')
        sig = f"{nm} | {qt}" if qt and qt != nm else nm
        existing_sigs.append((sig, ex))

    matched = 0
    for cluster in clusters:
        # Use the cluster's representative (first question)
        rep = cluster[0]
        rep_sig = rep['norm_name']
        if rep['norm_question'] and rep['norm_question'] != rep['norm_name']:
            rep_sig = f"{rep['norm_name']} | {rep['norm_question']}"

        best_score = 0
        best_ex = None
        for (sig, ex) in existing_sigs:
            score = fuzz.token_set_ratio(rep_sig, sig)
            if score > best_score:
                best_score = score
                best_ex = ex

        if best_score >= threshold:
            for q in cluster:
                q['matches_existing_id'] = best_ex['id']
                q['matches_existing_name'] = best_ex['name']
                q['match_score'] = best_score
            matched += 1

    return matched


# ───────────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────────
def main():
    print('[1] Extracting questions from spreadsheet...')
    questions = extract_questions()
    print(f'    Extracted {len(questions)} questions')

    print('[2] Loading existing Align standards...')
    existing = load_existing_standards()
    print(f'    Loaded {len(existing)} existing standards')

    print('[3] Clustering at 95% threshold (takes ~1-2 min)...')
    clusters = cluster(questions, threshold=95)
    print(f'    {len(questions)} questions → {len(clusters)} clusters')

    print('[4] Matching clusters against existing standards...')
    matched = match_existing(clusters, existing, threshold=95)
    print(f'    {matched} clusters match existing standards (will add framework tags only)')

    # Summary stats
    multi_clusters = [c for c in clusters if len(c) > 1]
    single_clusters = [c for c in clusters if len(c) == 1]

    # Framework breakdown per cluster
    framework_per_cluster = []
    for c in clusters:
        fws = set(q['framework'] for q in c if q['framework'])
        framework_per_cluster.append(fws)

    # Count framework-only clusters vs operational-only vs mixed
    cross_framework = sum(1 for fws in framework_per_cluster if len(fws) > 1)
    operational_only = sum(1 for c in clusters if not any(q['framework'] for q in c))
    framework_only = sum(1 for c in clusters if all(q['framework'] for q in c))

    report = {
        'total_questions': len(questions),
        'total_clusters': len(clusters),
        'matched_to_existing_align': matched,
        'need_new_master_standard': len(clusters) - matched,
        'clusters_with_multiple_questions': len(multi_clusters),
        'singleton_clusters': len(single_clusters),
        'cross_framework_clusters': cross_framework,
        'operational_only_clusters': operational_only,
        'framework_only_clusters': framework_only,
    }

    print('\n═══════════════ DEDUP REPORT ═══════════════')
    for k, v in report.items():
        print(f'  {k:40s}: {v}')
    print()

    # Save full cluster data for next phase
    with open(f'{OUT_DIR}/clusters.json', 'w') as f:
        json.dump({
            'report': report,
            'clusters': [[q for q in c] for c in clusters],
            'existing_count': len(existing),
        }, f, indent=2, default=str)
    print(f'Written: {OUT_DIR}/clusters.json')

    # Save a human-readable merge preview
    with open(f'{OUT_DIR}/merge_preview.md', 'w') as f:
        f.write(f'# Dedup Merge Preview (95% threshold)\n\n')
        f.write(f'Total input questions: {len(questions)}\n')
        f.write(f'Resulting master controls: {len(clusters)}\n')
        f.write(f'  - Matched to existing Align standards: {matched}\n')
        f.write(f'  - New master standards needed: {len(clusters) - matched}\n\n')

        f.write(f'## Multi-member clusters (duplicates found): {len(multi_clusters)}\n\n')
        for i, c in enumerate(sorted(multi_clusters, key=lambda x: -len(x))[:100]):
            fws = sorted(set(q['framework'] or 'OPS' for q in c))
            f.write(f'### Cluster {i+1} ({len(c)} members, frameworks: {", ".join(fws)})\n')
            if c[0].get('matches_existing_name'):
                f.write(f'**Matches existing Align standard:** {c[0]["matches_existing_name"]} (score {c[0]["match_score"]})\n\n')
            for q in c:
                f.write(f'- **[{q["framework"] or "OPS"}]** {q["section"]} / {q["category"]}: **{q["name"]}** (P={q["priority"]})\n')
                f.write(f'    Q: {q["question_text"][:150]}\n')
            f.write('\n')

    print(f'Written: {OUT_DIR}/merge_preview.md')


if __name__ == '__main__':
    main()
