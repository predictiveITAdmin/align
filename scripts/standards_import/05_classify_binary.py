#!/usr/bin/env python3
"""
Classify each imported standard as:
  - 'binary':  genuinely yes/no (control exists or doesn't, policy documented or not, etc.)
  - 'graded':  has meaningful 5-level maturity scoring (coverage %, effectiveness, etc.)
  - 'ternary': yes/no/partial (some controls are implemented but gaps remain)

Then:
  - Report distribution across the 1,387 standards
  - Propose which existing drafts should be converted to binary (3 responses: Yes/No/NA)
  - Rerun dedup analysis applying this classification
"""
import json
import re
import subprocess
import sys
from collections import defaultdict

# ───────────────────────────────────────────────────────────────────────
# Classification heuristics
# ───────────────────────────────────────────────────────────────────────

# Strong binary indicators — control either exists or doesn't
BINARY_PATTERNS = [
    # Policy/procedure existence
    r'\bdo(es)?\s+(.*\s+)?(exist|have|hav)',
    r'\bis\s+(a|an|the)\s+.+\s+(documented|in place|defined|written|signed|approved)',
    r'\bare\s+.+\s+(documented|in place|defined|written|signed|approved|established)',
    r'\bhas\s+(the|a)\s+.+\s+been\s+(established|defined|documented|created|approved)',
    r'\bhave\s+.+\s+been\s+(established|defined|documented|created)',
    # Specific implementation existence (not coverage)
    r'\bis\s+(mfa|multi-factor|antivirus|edr|backup|encryption|logging)\s+(enabled|configured|installed|in place)',
    r'\bare\s+logs?\s+(retained|collected|centralized)',
    r'\bdo(es)?\s+.+\s+(use|have)\s+(a|an)\s+.+\s+(system|tool|solution|platform)',
    # Boolean-style: "Is X?"
    r'^is\s+(there|a|the)\s+',
    # Existence/presence questions
    r'\bexist(s)?\b',
    r'\bin place\b',
]

# Strong graded indicators — coverage/quality/effectiveness matters
GRADED_PATTERNS = [
    r'\ball\s+(endpoints?|workstations?|servers?|systems?|users?|devices?|assets?)',
    r'\b(100%|95%|coverage)\b',
    r'\b(consistently|regularly|periodically|frequently)\b',
    r'\bmeet\s+the\s+following',
    r'\bstandardi[sz]ed',
    r'\bconsistent(ly)?\s+(applied|enforced|configured)',
    r'\bacross\s+(the|all)\s+',
    r'\b(up to date|up-to-date)',
    r'\btracked?\b',
    r'\bmonitored?\b',
    r'\breviewed?\s+(regularly|periodically|quarterly|annually)',
]

# Specific question-start phrases that signal binary
BINARY_STARTS = [
    'does the organization facilitate',
    'does the organization develop',
    'does the organization maintain',
    'does the organization document',
    'does the organization establish',
    'mechanisms exist to',
    'is there a',
    'is there an',
    'has the',
    'have all',
    'are policies',
    'is a policy',
    'has a',
]


def classify(q):
    """Classify a standard as 'binary', 'graded', 'ternary', or 'informational'."""
    text = (q.get('question_text') or q.get('name') or '').lower()

    # ── Informational questions (What/How many/Who) — not really assessable as compliant/non ──
    if re.match(r'^(what|which|how many|who|where|when)\s', text):
        return 'informational'

    # ── Multi-part detection: multiple question marks in a single question, or has a sub-list
    # A question with 2+ "?" is almost always multi-part (graded)
    question_count = text.count('?')
    if question_count >= 2:
        return 'graded'

    # ── Checklist/list pattern: "meet the following" + contains colon + several sub-items
    if 'following standard' in text or 'meet the following' in text or 'below standard' in text:
        return 'graded'

    # ── Colon followed by multiple clauses (likely a checklist/list)
    # e.g., "Are all X: A, B, C, D?" — the multiple comma-separated items after the colon
    after_colon = text.split(':', 1)
    if len(after_colon) > 1:
        sub = after_colon[1]
        # Count list markers: commas between clauses, or bullet-like structure
        if sub.count(',') >= 3 or sub.count(';') >= 2:
            return 'graded'

    # ── Explicit coverage language
    graded_hits = sum(1 for p in GRADED_PATTERNS if re.search(p, text))
    binary_hits = sum(1 for p in BINARY_PATTERNS if re.search(p, text))
    starts_binary = any(text.startswith(s) for s in BINARY_STARTS)

    is_long = len(text) > 250
    is_very_long = len(text) > 400

    # Very long questions nearly always have multiple aspects
    if is_very_long:
        return 'graded'

    # Strong graded signals
    if graded_hits >= 2:
        return 'graded'
    if graded_hits >= 1 and is_long:
        return 'graded'

    # Strong binary signals override
    if starts_binary and graded_hits == 0:
        return 'binary'
    if binary_hits >= 2 and graded_hits == 0:
        return 'binary'

    # Ambiguous — binary if short + no graded signals
    if binary_hits > graded_hits and not is_long:
        return 'binary'

    # Mixed signals → ternary
    if binary_hits > 0 and graded_hits > 0 and not is_very_long:
        return 'ternary'

    # Default: short+nothing → binary; long → graded
    return 'binary' if not is_long else 'graded'


def classify_all(standards):
    """Run classifier on all standards."""
    results = defaultdict(list)
    for s in standards:
        mode = classify(s)
        s['proposed_response_mode'] = mode
        results[mode].append(s)
    return results


def load_imported_standards():
    """Query DB for all newly imported drafts via a tmp file to avoid stdout truncation."""
    helper_js = '''
        const fs = require('fs');
        process.env.PGHOST="10.168.2.46";
        process.env.PGPASSWORD="7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e";
        const db = require("/opt/align/src/db");
        (async () => {
          const r = await db.query(`
            SELECT s.id, s.name, s.question_text, s.priority, s.status,
                   sc.name AS category_name, ss.name AS section_name,
                   (SELECT array_agg(sft.framework) FROM standard_framework_tags sft WHERE sft.standard_id = s.id) AS frameworks
            FROM standards s
            JOIN standard_categories sc ON sc.id = s.category_id
            LEFT JOIN standard_sections ss ON ss.id = sc.section_id
            WHERE s.tenant_id IS NOT NULL AND s.is_active = true
              AND s.import_source = 'myitprocess_2026_04_17'
          `);
          fs.writeFileSync('/tmp/standards_import/_drafts.json', JSON.stringify(r.rows));
          process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    '''
    with open('/tmp/standards_import/_load_drafts.js', 'w') as f:
        f.write(helper_js)
    r = subprocess.run(['node', '/tmp/standards_import/_load_drafts.js'], capture_output=True, text=True, cwd='/opt/align')
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr); sys.exit(1)
    with open('/tmp/standards_import/_drafts.json') as f:
        return json.load(f)


def main():
    print('[1] Loading imported draft standards...')
    standards = load_imported_standards()
    print(f'    {len(standards)} imported drafts')

    print('[2] Classifying...')
    results = classify_all(standards)

    total = len(standards)
    print('\n═══════════ CLASSIFICATION RESULTS ═══════════')
    for mode in ['binary', 'ternary', 'graded']:
        n = len(results.get(mode, []))
        pct = 100.0 * n / total if total else 0
        print(f'  {mode:8s}: {n:5d}  ({pct:.1f}%)')

    # Breakdown by section
    by_section = defaultdict(lambda: defaultdict(int))
    for s in standards:
        by_section[s['section_name']][s['proposed_response_mode']] += 1

    print('\n─── By section ───')
    for sec, modes in sorted(by_section.items(), key=lambda x: -sum(x[1].values())):
        tot = sum(modes.values())
        b = modes.get('binary', 0); t = modes.get('ternary', 0); g = modes.get('graded', 0)
        print(f'  {sec:30s} total:{tot:4d}  binary:{b:3d}  ternary:{t:3d}  graded:{g:3d}')

    # Sample outputs
    print('\n─── Sample: binary (first 8) ───')
    for s in results.get('binary', [])[:8]:
        q = (s.get('question_text') or s.get('name') or '')[:140]
        print(f'  • [{s["section_name"]}] {s["name"]}: {q}')

    print('\n─── Sample: graded (first 5) ───')
    for s in results.get('graded', [])[:5]:
        q = (s.get('question_text') or s.get('name') or '')[:140]
        print(f'  • [{s["section_name"]}] {s["name"]}: {q}')

    print('\n─── Sample: ternary (first 5) ───')
    for s in results.get('ternary', [])[:5]:
        q = (s.get('question_text') or s.get('name') or '')[:140]
        print(f'  • [{s["section_name"]}] {s["name"]}: {q}')

    # Save for next step
    with open('/tmp/standards_import/classification.json', 'w') as f:
        json.dump({
            'summary': {mode: len(results.get(mode, [])) for mode in ['binary', 'ternary', 'graded']},
            'by_section': {sec: dict(m) for sec, m in by_section.items()},
            'standards': [{'id': s['id'], 'name': s['name'], 'mode': s['proposed_response_mode']} for s in standards]
        }, f, indent=2, default=str)
    print('\nWritten: /tmp/standards_import/classification.json')


if __name__ == '__main__':
    main()
