#!/usr/bin/env python3
"""
Second-pass dedup analysis.

Scope: find imported drafts (1,387) that are likely duplicates of the EXISTING 134
approved Align standards, but didn't match at 95%. Use looser threshold (75-94%)
and produce a review list.

Because the existing 134 use MSP operational language and the imports use formal
compliance language, most matches will be semantic (same control, different phrasing).

Strategy:
  1. Normalize both sides (strip prefixes, boilerplate)
  2. Use rapidfuzz partial_ratio + token_set_ratio (each captures different similarity)
  3. Take the max score as the "semantic similarity"
  4. For each imported draft, find best matching existing standard
  5. Bucket by score:  >=90% (very likely dup), 80-89% (probable), 75-79% (worth checking)
  6. Output: CSV for manual review + JSON for "merge existing → add framework tag" action
"""
import json
import re
import subprocess
import sys
import csv
from rapidfuzz import fuzz

QUESTION_PREFIXES = [
    r'^does the organization\s+', r'^do the\s+', r'^do all\s+',
    r'^does the customer\s+', r'^are all\s+', r'^is the\s+',
    r'^are the\s+', r'^do we\s+', r'^is there\s+', r'^are there\s+',
    r'^has the organization\s+', r'^have all\s+', r'^mechanisms exist to\s+',
    r'^facilitate the implementation of\s+',
]
STOPWORDS = {'the', 'a', 'an', 'to', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been'}


def normalize(text):
    if not text:
        return ''
    t = text.lower().strip()
    for pat in QUESTION_PREFIXES:
        t = re.sub(pat, '', t)
    t = re.sub(r'\s+', ' ', t).rstrip('?!.,;:')
    t = re.sub(r'[^\w\s-]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def load_via_js():
    """Load both existing (approved) and imported (draft) standards."""
    helper = '''
        const fs = require('fs');
        process.env.PGHOST="10.168.2.46";
        process.env.PGPASSWORD="7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e";
        const db = require("/opt/align/src/db");
        (async () => {
          const existing = await db.query(`
            SELECT s.id, s.name, s.question_text, s.description,
                   sc.name AS category_name, ss.name AS section_name,
                   s.priority
            FROM standards s
            JOIN standard_categories sc ON sc.id = s.category_id
            LEFT JOIN standard_sections ss ON ss.id = sc.section_id
            WHERE s.is_active = true AND s.status = 'approved'
              AND (s.import_source IS NULL OR s.import_source != 'myitprocess_2026_04_17')
          `);
          const imported = await db.query(`
            SELECT s.id, s.name, s.question_text, s.description,
                   sc.name AS category_name, ss.name AS section_name,
                   s.priority, s.response_mode,
                   (SELECT array_agg(sft.framework) FROM standard_framework_tags sft WHERE sft.standard_id = s.id) AS frameworks
            FROM standards s
            JOIN standard_categories sc ON sc.id = s.category_id
            LEFT JOIN standard_sections ss ON ss.id = sc.section_id
            WHERE s.import_source = 'myitprocess_2026_04_17'
          `);
          fs.writeFileSync('/tmp/standards_import/_existing.json', JSON.stringify(existing.rows));
          fs.writeFileSync('/tmp/standards_import/_imported.json', JSON.stringify(imported.rows));
          process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    '''
    with open('/tmp/standards_import/_load_both.js', 'w') as f:
        f.write(helper)
    r = subprocess.run(['node', '/tmp/standards_import/_load_both.js'], capture_output=True, text=True, cwd='/opt/align')
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr); sys.exit(1)
    with open('/tmp/standards_import/_existing.json') as f:
        existing = json.load(f)
    with open('/tmp/standards_import/_imported.json') as f:
        imported = json.load(f)
    return existing, imported


def score_pair(a, b):
    """Compute semantic similarity. Returns max of several algorithms."""
    a_text = normalize(f"{a.get('name') or ''} {a.get('question_text') or ''}")
    b_text = normalize(f"{b.get('name') or ''} {b.get('question_text') or ''}")

    if not a_text or not b_text:
        return 0, 0, 0

    # token_set_ratio: good for reordering/subset matches
    ts = fuzz.token_set_ratio(a_text, b_text)
    # partial_ratio: good for when one contains a substring of the other
    pr = fuzz.partial_ratio(a_text, b_text)
    # Name-only ratio: important for control identity
    name_ratio = fuzz.ratio(normalize(a.get('name') or ''), normalize(b.get('name') or ''))

    return max(ts, pr), name_ratio, (ts + pr + name_ratio) / 3


def main():
    print('[1] Loading from DB...')
    existing, imported = load_via_js()
    print(f'    {len(existing)} existing approved standards')
    print(f'    {len(imported)} imported drafts')

    print(f'[2] Comparing {len(imported)} imports x {len(existing)} existing (75% threshold)...')

    matches = []
    # For each import, find its best existing match
    for i, imp in enumerate(imported):
        best = None
        best_score = 0
        best_breakdown = (0, 0, 0)
        for ex in existing:
            score, name_score, avg_score = score_pair(imp, ex)
            if score > best_score:
                best_score = score
                best_breakdown = (score, name_score, avg_score)
                best = ex
        if best_score >= 75 and best:
            matches.append({
                'import': imp,
                'existing': best,
                'score_semantic': best_breakdown[0],
                'score_name': best_breakdown[1],
                'score_avg': best_breakdown[2],
            })
        if (i + 1) % 200 == 0:
            print(f'    {i+1}/{len(imported)} processed, {len(matches)} matches so far')

    # Bucket
    very_likely = [m for m in matches if m['score_semantic'] >= 90]
    probable    = [m for m in matches if 80 <= m['score_semantic'] < 90]
    possible    = [m for m in matches if 75 <= m['score_semantic'] < 80]

    print()
    print('══════════ SECOND-PASS DEDUP RESULTS ══════════')
    print(f'  Very likely duplicate (≥90%):  {len(very_likely)}')
    print(f'  Probable duplicate (80-89%):   {len(probable)}')
    print(f'  Possible duplicate (75-79%):   {len(possible)}')
    print(f'  No match ≥75%:                 {len(imported) - len(matches)}')

    # Breakdown by response_mode
    by_mode = {'binary': 0, 'ternary': 0, 'graded': 0, 'informational': 0}
    for m in matches:
        mode = m['import'].get('response_mode', 'graded')
        by_mode[mode] = by_mode.get(mode, 0) + 1
    print(f'\n  Match candidates by response mode:')
    for mode, n in by_mode.items():
        print(f'    {mode:15s}: {n}')

    # Write CSV for review
    with open('/tmp/standards_import/dedup_second_pass.csv', 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow([
            'tier', 'score_max', 'score_name', 'score_avg',
            'existing_id', 'existing_section', 'existing_name', 'existing_question',
            'import_id', 'import_section', 'import_name', 'import_question',
            'import_response_mode', 'import_frameworks'
        ])
        for m in sorted(matches, key=lambda x: -x['score_semantic']):
            tier = 'VERY_LIKELY' if m['score_semantic'] >= 90 else ('PROBABLE' if m['score_semantic'] >= 80 else 'POSSIBLE')
            ex, im = m['existing'], m['import']
            w.writerow([
                tier,
                f"{m['score_semantic']:.1f}",
                f"{m['score_name']:.1f}",
                f"{m['score_avg']:.1f}",
                ex['id'],
                ex['section_name'],
                ex['name'],
                (ex.get('question_text') or '')[:200],
                im['id'],
                im['section_name'],
                im['name'],
                (im.get('question_text') or '')[:200],
                im.get('response_mode', ''),
                ','.join(im.get('frameworks') or []),
            ])
    print(f'\nWritten: /tmp/standards_import/dedup_second_pass.csv')

    # Also output a human-readable sample of the strong matches for review
    with open('/tmp/standards_import/dedup_second_pass.md', 'w') as f:
        f.write(f'# Second-Pass Dedup — Existing ↔ Imported\n\n')
        f.write(f'Total import candidates: {len(imported)}\n')
        f.write(f'  - Very Likely Dup (≥90%): {len(very_likely)}\n')
        f.write(f'  - Probable Dup (80-89%):  {len(probable)}\n')
        f.write(f'  - Possible Dup (75-79%):  {len(possible)}\n\n')

        f.write(f'## VERY LIKELY Duplicates ({len(very_likely)}) — suggest MERGE: add framework tags to existing, drop draft\n\n')
        for m in sorted(very_likely, key=lambda x: -x['score_semantic'])[:40]:
            ex, im = m['existing'], m['import']
            f.write(f'### score {m["score_semantic"]:.0f} — EXISTING "{ex["name"]}" ↔ IMPORT "{im["name"]}"\n')
            f.write(f'- **Existing** [{ex["section_name"]}]: {(ex.get("question_text") or ex["name"])[:180]}\n')
            f.write(f'- **Imported** [{im["section_name"]}, {im.get("response_mode")}, frameworks: {",".join(im.get("frameworks") or [])}]: {(im.get("question_text") or im["name"])[:180]}\n\n')

        f.write(f'\n## PROBABLE Duplicates ({len(probable)}) — review recommended\n\n')
        for m in sorted(probable, key=lambda x: -x['score_semantic'])[:30]:
            ex, im = m['existing'], m['import']
            f.write(f'### score {m["score_semantic"]:.0f} — EXISTING "{ex["name"]}" ↔ IMPORT "{im["name"]}"\n')
            f.write(f'- **Existing** [{ex["section_name"]}]: {(ex.get("question_text") or ex["name"])[:180]}\n')
            f.write(f'- **Imported** [{im["section_name"]}, frameworks: {",".join(im.get("frameworks") or [])}]: {(im.get("question_text") or im["name"])[:180]}\n\n')

    print(f'Written: /tmp/standards_import/dedup_second_pass.md')

    # Save JSON for next step (auto-merge action)
    with open('/tmp/standards_import/dedup_second_pass.json', 'w') as f:
        json.dump({
            'very_likely': [{'import_id': m['import']['id'], 'existing_id': m['existing']['id'],
                             'import_frameworks': m['import'].get('frameworks') or [],
                             'score': m['score_semantic']} for m in very_likely],
            'probable':    [{'import_id': m['import']['id'], 'existing_id': m['existing']['id'],
                             'import_frameworks': m['import'].get('frameworks') or [],
                             'score': m['score_semantic']} for m in probable],
        }, f, indent=2)


if __name__ == '__main__':
    main()
