#!/usr/bin/env python3
"""
V2: Smarter clustering that respects framework control references.

Rules:
  1. Within the same framework, DO NOT merge if the 'name' field (control ref) differs.
     PCI 2.1.1 ≠ PCI 3.1.1 even if question text is 95% similar.
  2. Across different frameworks OR operational (no framework), merge if
     question text + name is ≥95% similar.
  3. Within OPS (operational, no framework), a cluster is valid if name matches
     across categories — e.g., "Server Operating System" across 6 server roles
     becomes ONE master. Jason can decide to keep merged or split during review.
"""
import openpyxl
import json
import re
import os
import sys
import subprocess
from rapidfuzz import fuzz

INPUT = '/tmp/Updated StandardsLibrary.xlsx'
OUT_DIR = '/tmp/standards_import'

FRAMEWORK_MAP = {
    'Onboarding Discovery': None,
    'Core Infrastructure': None,
    'Server Infrastructure': None,
    'Server Room/Data Center': None,
    'Hardware': None,
    'Software': None,
    'Business Continuity': None,
    'Contingency Planning & Business Continuity': None,
    'NIST 800-171 rev 2': 'NIST-800-171-R2',
    'NIST CSF 2.0': 'NIST-CSF-2',
    'ISO 27001 : 2022': 'ISO-27001-2022',
    'PCI - DSS SAQ C 4.0.1': 'PCI-DSS-4',
    'CMMC Level 2 - Version 2.13 (NIST SP 800-171 Rev. 2)': 'CMMC-L2',
    'CMMC Level 1 - FAR Clause 52.204-21': 'CMMC-L1',
    'Cybersecurity Practices for Small Health Care Organizations':  'HIPAA',
    'Cybersecurity Practices for Medium Health Care Organizations': 'HIPAA',
    'Cybersecurity Practices for Large Health Care Organizations':  'HIPAA',
}
SKIP_SECTIONS = {'Cybersecurity', 'Regularory Compliance'}

QUESTION_PREFIXES = [
    r'^does the organization\s+', r'^do the\s+', r'^do all\s+',
    r'^does the customer\s+', r'^are all\s+', r'^is the\s+',
    r'^are the\s+', r'^do we\s+', r'^is there\s+', r'^are there\s+',
    r'^has the organization\s+', r'^have all\s+', r'^mechanisms exist to\s+',
]

def normalize(text):
    if not text: return ''
    t = text.lower().strip()
    for pat in QUESTION_PREFIXES:
        t = re.sub(pat, '', t)
    t = re.sub(r'\s+', ' ', t).rstrip('?!.,;:')
    t = re.sub(r'[^\w\s-]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def extract():
    wb = openpyxl.load_workbook(INPUT, data_only=True)
    ws = wb['Template']
    qs = []
    section = category = None
    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        rtype = (row[1] or '').strip()
        if rtype == 'Section':
            section, category = row[2], None
        elif rtype == 'Category':
            category = row[2]
        elif rtype == 'Question' and section not in SKIP_SECTIONS:
            qs.append({
                'row_id': row[0],
                'row_num': idx,
                'section': section,
                'category': category,
                'name': (row[2] or '').strip(),
                'priority': (row[5] or 'Medium').strip(),
                'question_text': (row[6] or '').strip(),
                'why': (row[7] or '').strip(),
                'how': (row[8] or '').strip(),
                'framework': FRAMEWORK_MAP.get(section),
                'norm_name': normalize(row[2] or ''),
                'norm_question': normalize(row[6] or ''),
            })
    return qs


def load_existing():
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
    r = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/align')
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr); sys.exit(1)
    return json.loads(r.stdout.strip())


def signature(q):
    """Build a weighted signature: name is weighted more heavily."""
    nm = q['norm_name']
    qt = q['norm_question']
    if qt and qt != nm:
        # Repeat name tokens to give them more weight in token_set_ratio
        return f"{nm} {nm} | {qt}"
    return nm


def similar(a, b, threshold=95):
    """Strict: require BOTH name and question_text to be similar."""
    # Name must be very close (this prevents PCI 2.1.1 merging with 3.1.1)
    name_score = fuzz.ratio(a['norm_name'], b['norm_name'])
    q_score = fuzz.token_set_ratio(a['norm_question'], b['norm_question']) if a['norm_question'] and b['norm_question'] else 100

    # Require name ≥85 AND question ≥threshold
    # Name similarity is the "same control" discriminator
    if name_score < 85:
        return False, name_score, q_score
    if q_score < threshold:
        return False, name_score, q_score
    return True, name_score, q_score


def cluster(questions, threshold=95):
    """
    Cluster questions. Within a framework, require exact or near-exact name match.
    Across frameworks, allow fuzzier question match.
    """
    clusters = []
    assigned = [False] * len(questions)

    for i in range(len(questions)):
        if assigned[i]:
            continue
        cl = [i]
        assigned[i] = True
        for j in range(i + 1, len(questions)):
            if assigned[j]:
                continue
            # If SAME framework and names differ significantly → DIFFERENT controls
            same_fw = questions[i]['framework'] == questions[j]['framework']
            name_score = fuzz.ratio(questions[i]['norm_name'], questions[j]['norm_name'])

            if same_fw and name_score < 85:
                continue  # same framework, different control names → skip

            # Check overall similarity
            ok, nscore, qscore = similar(questions[i], questions[j], threshold=threshold)
            if ok:
                cl.append(j)
                assigned[j] = True
        clusters.append([questions[idx] for idx in cl])

    return clusters


def match_existing(clusters, existing, threshold=95):
    """For each cluster, find best match against existing Align standards."""
    # Build existing sig list
    ex_sigs = []
    for ex in existing:
        ex_sigs.append({
            'id': ex['id'],
            'name': ex['name'],
            'norm_name': normalize(ex['name'] or ''),
            'norm_question': normalize(ex.get('question_text') or ''),
        })

    matched = 0
    borderline = 0
    for c in clusters:
        rep = c[0]
        best_score = 0
        best_ex = None
        for ex in ex_sigs:
            ok, nscore, qscore = similar(rep, ex, threshold=threshold)
            combined = (nscore + qscore) / 2
            if ok and combined > best_score:
                best_score = combined
                best_ex = ex
            elif not ok:
                # Track borderline (>=75 but didn't match)
                if nscore >= 75 or qscore >= 75:
                    combined = (nscore + qscore) / 2
                    if combined > best_score and combined >= 75:
                        best_score = combined
                        best_ex = ex

        if best_ex and best_score >= threshold:
            for q in c:
                q['matches_existing_id'] = best_ex['id']
                q['matches_existing_name'] = best_ex['name']
                q['match_score'] = best_score
            matched += 1
        elif best_ex and best_score >= 75:
            for q in c:
                q['borderline_existing_id'] = best_ex['id']
                q['borderline_existing_name'] = best_ex['name']
                q['borderline_score'] = best_score
            borderline += 1

    return matched, borderline


def main():
    print('[1] Extracting...')
    qs = extract()
    print(f'    {len(qs)} questions')

    print('[2] Loading existing Align standards...')
    ex = load_existing()
    print(f'    {len(ex)} existing')

    print('[3] Clustering (v2, name-aware)...')
    clusters = cluster(qs, threshold=95)
    print(f'    {len(qs)} → {len(clusters)} clusters')

    print('[4] Matching against existing...')
    matched, borderline = match_existing(clusters, ex, threshold=95)
    print(f'    {matched} matched existing (≥95%), {borderline} borderline (75-94%)')

    # Stats
    multi = [c for c in clusters if len(c) > 1]
    single = [c for c in clusters if len(c) == 1]

    # Framework breakdown
    cross_fw = 0  # clusters spanning 2+ frameworks
    ops_only = 0
    fw_only_clusters = {}  # per-framework cluster counts
    for c in clusters:
        fws = set(q['framework'] for q in c if q['framework'])
        if len(fws) >= 2: cross_fw += 1
        if not any(q['framework'] for q in c): ops_only += 1
        for fw in fws:
            fw_only_clusters[fw] = fw_only_clusters.get(fw, 0) + 1

    print('\n═════════════ V2 DEDUP REPORT ═════════════')
    print(f'  Input questions              : {len(qs)}')
    print(f'  Output master controls       : {len(clusters)}')
    print(f'  Questions deduped            : {len(qs) - len(clusters)}')
    print(f'  Multi-member clusters        : {len(multi)}')
    print(f'  Singleton clusters           : {len(single)}')
    print(f'  Cross-framework clusters     : {cross_fw}  (same control in 2+ frameworks)')
    print(f'  Operational-only clusters    : {ops_only}')
    print(f'  Auto-matched to existing 134 : {matched}')
    print(f'  Borderline vs existing (75-94%): {borderline}')
    print()
    print('  Standards per framework:')
    for fw, n in sorted(fw_only_clusters.items()):
        print(f'    {fw:20s}: {n}')
    print()

    # Output
    with open(f'{OUT_DIR}/clusters_v2.json', 'w') as f:
        json.dump({
            'clusters': [[q for q in c] for c in clusters],
            'stats': {
                'input_questions': len(qs),
                'master_controls': len(clusters),
                'multi_member': len(multi),
                'singletons': len(single),
                'cross_framework': cross_fw,
                'matched_existing': matched,
                'borderline_existing': borderline,
                'per_framework': fw_only_clusters,
            }
        }, f, indent=2, default=str)
    print(f'Written: {OUT_DIR}/clusters_v2.json')

    # Human preview: top merged clusters
    with open(f'{OUT_DIR}/merge_preview_v2.md', 'w') as f:
        f.write(f'# Dedup Merge Preview V2 (95% threshold, name-aware)\n\n')
        f.write(f'Input: {len(qs)} questions → Output: {len(clusters)} master controls\n')
        f.write(f'Deduped: {len(qs) - len(clusters)} questions merged into shared masters\n\n')

        f.write(f'## Cross-framework clusters ({cross_fw}) — same control across multiple frameworks\n\n')
        f.write('These are the most valuable dedups: a single control answered once satisfies many frameworks.\n\n')
        cfw = [c for c in multi if len(set(q['framework'] for q in c if q['framework'])) >= 2]
        for i, c in enumerate(sorted(cfw, key=lambda x: -len(set(q['framework'] for q in x if q['framework'])))[:50]):
            fws = sorted(set(q['framework'] or 'OPS' for q in c))
            f.write(f'### Cross-FW #{i+1} ({len(c)} questions → 1 master, frameworks: {", ".join(fws)})\n')
            for q in c:
                f.write(f'- **[{q["framework"] or "OPS"}]** {q["category"]}: **{q["name"]}** (P={q["priority"]})\n')
                if q['question_text']: f.write(f'    Q: {q["question_text"][:160]}\n')
            f.write('\n')

        f.write(f'\n## Operational cross-category clusters ({ops_only} ops clusters, showing merged only)\n\n')
        f.write('These are operational standards asked the same way across multiple categories.\n\n')
        ops_multi = [c for c in multi if not any(q['framework'] for q in c)]
        for i, c in enumerate(sorted(ops_multi, key=lambda x: -len(x))[:30]):
            cats = sorted(set(q['category'] for q in c))
            f.write(f'### OPS #{i+1} ({len(c)} questions across: {", ".join(cats)})\n')
            f.write(f'- **{c[0]["name"]}** (P={c[0]["priority"]})\n')
            if c[0]['question_text']: f.write(f'    Q: {c[0]["question_text"][:160]}\n')
            f.write('\n')

    print(f'Written: {OUT_DIR}/merge_preview_v2.md')

    # Borderline vs existing file (for second-pass review)
    borderline_clusters = [c for c in clusters if c[0].get('borderline_existing_name')]
    if borderline_clusters:
        with open(f'{OUT_DIR}/borderline_vs_existing.md', 'w') as f:
            f.write(f'# Borderline Matches vs Existing Align Standards\n\n')
            f.write(f'Clusters scoring 75-94% against an existing standard — candidates for manual review\n\n')
            for c in sorted(borderline_clusters, key=lambda x: -x[0].get('borderline_score', 0))[:50]:
                rep = c[0]
                f.write(f'## {rep["name"]} (score {rep["borderline_score"]:.0f})\n')
                f.write(f'- Existing Align: **{rep["borderline_existing_name"]}**\n')
                f.write(f'- New imported:   **{rep["name"]}** [{rep["framework"] or "OPS"}]\n')
                if rep['question_text']: f.write(f'  Q: {rep["question_text"][:160]}\n')
                f.write('\n')
        print(f'Written: {OUT_DIR}/borderline_vs_existing.md')


if __name__ == '__main__':
    main()
