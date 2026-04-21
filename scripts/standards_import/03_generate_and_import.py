#!/usr/bin/env python3
"""
Phase B: Generate responses + evidence for all 1,387 clusters and import to DB as drafts.

Strategy:
  - For each cluster, pick a representative (best-worded member)
  - Assign section + category based on cluster membership:
      * Cross-framework clusters with OPS member → operational Align section
      * Compliance-only clusters → framework-specific section
      * OPS-only clusters → operational Align section
  - Generate 5-level responses via topic-aware templates
  - Generate evidence examples for framework-tagged standards
  - Insert standards + framework_tags + responses in a single transaction as DRAFT status
"""
import json
import os
import re
import sys
import subprocess
from collections import defaultdict

CLUSTERS_FILE = '/tmp/standards_import/clusters_v2.json'
OUT_SQL = '/tmp/standards_import/import.sql'
OUT_JSON = '/tmp/standards_import/import_ready.json'

# ───────────────────────────────────────────────────────────────────────
# Section/category routing
# ───────────────────────────────────────────────────────────────────────

# For OPS / cross-framework clusters: which Align section?
# Key = (spreadsheet_section, spreadsheet_category) → Align section name
OPS_SECTION_MAP = {
    # Onboarding Discovery
    ('Onboarding Discovery', 'Endpoints Infrastructure'):                   'Endpoint Management',
    ('Onboarding Discovery', 'Network Infrastructure'):                     'Network Infrastructure',
    ('Onboarding Discovery', 'Servers'):                                    'Server Infrastructure',
    ('Onboarding Discovery', 'Security'):                                   'Security Operations',
    ('Onboarding Discovery', 'Cloud'):                                      'Cloud & Applications',
    ('Onboarding Discovery', 'Active Directory / Entra ID'):                'Identity & Access',
    ('Onboarding Discovery', 'Printing & Document Management'):             'Hardware & Peripherals',
    ('Onboarding Discovery', 'Backup, Disaster Recovery & Business Continuity'): 'Backup & Disaster Recovery',
    ('Onboarding Discovery', 'PBX / Phone System'):                         'Hardware & Peripherals',
    ('Onboarding Discovery', 'IT Management'):                              'Documentation & Operations',
    # Core Infrastructure → Network
    ('Core Infrastructure', 'Network'):                                     'Network Infrastructure',
    ('Core Infrastructure', 'Firewall'):                                    'Network Infrastructure',
    ('Core Infrastructure', 'Internet'):                                    'Network Infrastructure',
    ('Core Infrastructure', 'Wireless'):                                    'Network Infrastructure',
    # Server Infrastructure (new section)
    # All Server Infrastructure/* goes to "Server Infrastructure" section
    # Server Room/Data Center → Physical
    ('Server Room/Data Center', 'Organizational & Operational'):            'Physical & Environmental',
    ('Server Room/Data Center', 'Power Management'):                        'Physical & Environmental',
    ('Server Room/Data Center', 'Environmental'):                           'Physical & Environmental',
    ('Server Room/Data Center', 'Cabling'):                                 'Physical & Environmental',
    ('Server Room/Data Center', 'Physical Security'):                       'Physical & Environmental',
    # Hardware (new section)
    ('Hardware', 'Workstations'):                                           'Hardware & Peripherals',
    ('Hardware', 'Internet of Things (IoT)'):                               'Hardware & Peripherals',
    ('Hardware', 'Printers/Copiers'):                                       'Hardware & Peripherals',
    ('Hardware', 'Telephony'):                                              'Hardware & Peripherals',
    # Software
    ('Software', 'LOB Application'):                                        'Cloud & Applications',
    ('Software', 'Cloud Applications'):                                     'Cloud & Applications',
    # Business Continuity
    ('Business Continuity', 'Disaster Recovery'):                           'Backup & Disaster Recovery',
    # Contingency Planning (mostly operational BCP)
    ('Contingency Planning & Business Continuity', 'Business Continuity & Disaster Recovery'): 'Backup & Disaster Recovery',
    ('Contingency Planning & Business Continuity', 'Capacity & Performance Planning'):         'Documentation & Operations',
    ('Contingency Planning & Business Continuity', 'Cloud Security'):                          'Cloud & Applications',
    ('Contingency Planning & Business Continuity', 'Cryptographic Protections'):               'Security Operations',
    ('Contingency Planning & Business Continuity', 'Physical & Environmental Security'):       'Physical & Environmental',
    ('Contingency Planning & Business Continuity', 'Third-Party Management'):                  'Third-Party Risk',
}

# Server Infrastructure category mapping (new section)
SERVER_INFRA_CATS = {
    'Backup Verification', 'Active Directory', 'Backup/Storage Device', 'Virtual Host',
    'Hosted Email', 'Domain Controller', 'Application Server', 'Exchange Server',
    'Database Server', 'File Server', 'RD Server'
}

# Framework → section name
FRAMEWORK_SECTION = {
    'ISO-27001-2022':  'ISO 27001:2022',
    'PCI-DSS-4':       'PCI-DSS 4.0.1',
    'CMMC-L1':         'CMMC Level 1',
    'CMMC-L2':         'CMMC Level 2',
    'NIST-CSF-2':      'NIST CSF 2.0',
    'NIST-800-171-R2': 'NIST 800-171 R2',
    'HIPAA':           'HIPAA Cybersecurity',
}

NEW_SECTIONS = [
    ('Server Infrastructure',   'Servers, virtualization, and server-role-specific controls', 13),
    ('Hardware & Peripherals',  'Workstations, printers, IoT, and telephony hardware', 14),
    ('ISO 27001:2022',          'ISO 27001:2022 Annex A controls', 20),
    ('NIST 800-171 R2',         'NIST SP 800-171 Revision 2 security requirements', 21),
    ('NIST CSF 2.0',            'NIST Cybersecurity Framework 2.0 subcategories', 22),
    ('PCI-DSS 4.0.1',           'PCI-DSS SAQ C 4.0.1 requirements', 23),
    ('CMMC Level 1',            'CMMC Level 1 — FAR Clause 52.204-21', 24),
    ('CMMC Level 2',            'CMMC Level 2 — NIST SP 800-171 Rev 2', 25),
    ('HIPAA Cybersecurity',     'HIPAA Cybersecurity Practices for Healthcare', 26),
]


# ───────────────────────────────────────────────────────────────────────
# Response templates — topic-aware
# ───────────────────────────────────────────────────────────────────────
RESPONSE_TEMPLATES = {
    # Topic keywords → customized responses
    'default': {
        'satisfactory':    'Control is fully implemented with documented procedures and evidence available.',
        'acceptable_risk': 'Control is substantially in place with documented exceptions; minor remediation scheduled.',
        'needs_attention': 'Control is partially implemented; gaps identified but not yet remediated.',
        'at_risk':         'Control is missing or significantly non-compliant; immediate action required.',
        'not_applicable':  'This control does not apply to this client\'s environment.',
    },
    'encryption': {
        'satisfactory':    'Strong encryption (AES-256 or equivalent) applied consistently with validated key management.',
        'acceptable_risk': 'Encryption in place with minor coverage gaps identified and scheduled for remediation.',
        'needs_attention': 'Partial encryption coverage; some systems or data stores unprotected.',
        'at_risk':         'Encryption missing or using weak/deprecated algorithms; sensitive data exposed.',
        'not_applicable':  'No sensitive data stored or transmitted that requires encryption.',
    },
    'mfa_auth': {
        'satisfactory':    'MFA enforced on 100% of privileged and standard accounts using phishing-resistant methods.',
        'acceptable_risk': 'MFA enforced on all privileged accounts and >95% of standard accounts; exceptions documented.',
        'needs_attention': 'MFA deployed but coverage gaps exist, particularly on legacy or service accounts.',
        'at_risk':         'MFA not enforced or enforced only on a subset of users; significant exposure.',
        'not_applicable':  'No remote access or authentication requirement in scope for this control.',
    },
    'patching': {
        'satisfactory':    'Automated patching deployed across all endpoints/servers with <14 day critical patch SLA.',
        'acceptable_risk': 'Patching SLA generally met; a small number of systems lag and are being tracked.',
        'needs_attention': 'Patching inconsistent; several systems missing recent critical updates.',
        'at_risk':         'Systems running significantly out-of-date software with known vulnerabilities.',
        'not_applicable':  'System not in scope for patching program.',
    },
    'backup': {
        'satisfactory':    'Backups running per schedule with successful restore tests in the last quarter.',
        'acceptable_risk': 'Backups running reliably; last restore test older than quarterly but within 6 months.',
        'needs_attention': 'Backups configured but restore testing inconsistent or incomplete.',
        'at_risk':         'Backups failing, incomplete, or never tested; data recoverability unverified.',
        'not_applicable':  'No data requiring backup in this system.',
    },
    'access_control': {
        'satisfactory':    'Least-privilege access enforced via role-based controls with documented access reviews.',
        'acceptable_risk': 'Access controls in place; access reviews conducted but not on a strict cadence.',
        'needs_attention': 'Some privilege creep or stale accounts; access reviews infrequent.',
        'at_risk':         'Access not controlled to least-privilege; excessive permissions or unreviewed accounts.',
        'not_applicable':  'System not in scope for access controls.',
    },
    'monitoring': {
        'satisfactory':    'Continuous monitoring with alerts routed to on-call; events triaged within SLA.',
        'acceptable_risk': 'Monitoring active; occasional alert fatigue or delayed triage identified.',
        'needs_attention': 'Monitoring deployed but coverage gaps or alert tuning needed.',
        'at_risk':         'Monitoring absent or alerts unactioned; threat visibility minimal.',
        'not_applicable':  'No monitoring requirement for this asset class.',
    },
    'policy': {
        'satisfactory':    'Policy documented, approved, communicated, and acknowledged by affected personnel.',
        'acceptable_risk': 'Policy documented and communicated; acknowledgment tracking in progress.',
        'needs_attention': 'Policy exists but outdated or not broadly communicated.',
        'at_risk':         'Policy missing or not enforced.',
        'not_applicable':  'No formal policy needed for this scope.',
    },
    'training': {
        'satisfactory':    'Annual training completed by 100% of workforce with evidence retained.',
        'acceptable_risk': 'Training completed by >95% of workforce; outstanding completions tracked.',
        'needs_attention': 'Training program in place but completion rates inconsistent.',
        'at_risk':         'No formal training program or low completion rates.',
        'not_applicable':  'User population not in scope for this training.',
    },
    'incident': {
        'satisfactory':    'Documented IR plan tested annually with defined roles, timelines, and communication paths.',
        'acceptable_risk': 'IR plan documented; last tabletop exercise older than annual schedule.',
        'needs_attention': 'IR plan partial or not tested; response roles unclear.',
        'at_risk':         'No documented IR plan or capability to respond to incidents.',
        'not_applicable':  'Incident response not in scope for this engagement.',
    },
    'physical': {
        'satisfactory':    'Physical controls (badge access, cameras, logs) implemented and periodically audited.',
        'acceptable_risk': 'Physical controls present with minor audit findings addressed.',
        'needs_attention': 'Physical controls partial or inconsistently enforced.',
        'at_risk':         'Physical security minimal; unauthorized access possible.',
        'not_applicable':  'No physical facility in scope for this control.',
    },
    'vendor': {
        'satisfactory':    'Vendor inventory current, contracts reviewed annually, security assessments on file.',
        'acceptable_risk': 'Vendor inventory maintained; assessments current for critical vendors.',
        'needs_attention': 'Vendor inventory incomplete; assessments inconsistent.',
        'at_risk':         'No vendor inventory or assessment program.',
        'not_applicable':  'No third-party vendors in scope.',
    },
    'inventory': {
        'satisfactory':    'Asset inventory complete, accurate, and updated on automated cadence; matches discovery tool output.',
        'acceptable_risk': 'Inventory maintained; minor drift from discovery tool identified and reconciled.',
        'needs_attention': 'Inventory exists but stale or incomplete in some categories.',
        'at_risk':         'No reliable asset inventory; visibility into environment limited.',
        'not_applicable':  'No assets in scope for inventory.',
    },
    'logging': {
        'satisfactory':    'Comprehensive logging with retention meeting requirements; logs centralized and protected from tampering.',
        'acceptable_risk': 'Logging in place with minor retention or coverage exceptions documented.',
        'needs_attention': 'Logging coverage partial or retention inconsistent.',
        'at_risk':         'Logging absent or insufficient to support investigation.',
        'not_applicable':  'No logging requirement for this system.',
    },
    'network': {
        'satisfactory':    'Network controls (segmentation, firewall rules, ACLs) implemented and reviewed regularly.',
        'acceptable_risk': 'Network controls in place; rule cleanup and documentation lag.',
        'needs_attention': 'Network controls partial; segmentation or filtering gaps exist.',
        'at_risk':         'Flat network or weak controls; lateral movement risk high.',
        'not_applicable':  'No network in scope for this control.',
    },
    'endpoint': {
        'satisfactory':    'All endpoints meet hardening baseline with EDR, patching, and compliance monitored centrally.',
        'acceptable_risk': 'Most endpoints compliant; small number of non-compliant devices tracked and remediating.',
        'needs_attention': 'Endpoint compliance inconsistent; some devices missing baseline controls.',
        'at_risk':         'Endpoints unmanaged or non-compliant with security baseline.',
        'not_applicable':  'No endpoints in scope for this control.',
    },
}


def pick_template(q):
    """Pick the best-matching response template for a question. Priority: more specific topics first."""
    text = (q.get('question_text', '') + ' ' + q.get('name', '') + ' ' + q.get('category', '')).lower()

    # Most specific first — these are high-confidence topic words
    if any(w in text for w in [' policy', ' policies', 'polic ', 'polic,', 'written policy', 'documented polic']):
        return 'policy'
    if any(w in text for w in ['training', 'awareness', 'educat', 'knowbe4']):
        return 'training'
    if any(w in text for w in ['incident response', 'incident management', 'breach notif', 'tabletop', 'ir plan']):
        return 'incident'
    if any(w in text for w in ['third-party', 'third party', 'supplier', 'vendor management', 'vendor assess', 'vendor risk', 'contract security']):
        return 'vendor'
    if any(w in text for w in ['asset inventor', 'inventory of', 'asset management', 'asset tracking', 'component inventor']):
        return 'inventory'
    if any(w in text for w in ['audit log', 'log review', 'logging policy', 'log retention', 'audit trail']):
        return 'logging'
    if any(w in text for w in ['physical access', 'physical security', 'facility', 'badge access', 'camera', 'door access']):
        return 'physical'
    if any(w in text for w in ['mfa', 'multi-factor', 'multifactor', 'two-factor', '2fa', 'authenticator app']):
        return 'mfa_auth'
    if any(w in text for w in ['encrypt', 'cryptograph', 'tls', 'ssl certificate', 'key management', 'at rest', 'in transit']):
        return 'encryption'
    if any(w in text for w in ['backup', 'recovery', 'restore test', ' rpo', ' rto', 'disaster recovery']):
        return 'backup'
    if any(w in text for w in ['siem', ' soc ', 'continuous monitor', 'detection capabil', 'alert triag']):
        return 'monitoring'
    if any(w in text for w in ['access control', 'least privilege', 'privileged access', 'role-based', 'rbac', 'access review']):
        return 'access_control'
    if any(w in text for w in ['patch management', 'patch cycle', 'vulnerability scan', 'vulnerability management', 'cve ']):
        return 'patching'
    if any(w in text for w in ['firewall', 'vlan', 'network segment', 'wireless security', 'network architecture']):
        return 'network'
    if any(w in text for w in ['endpoint', 'workstation', 'laptop', 'desktop', 'edr ', 'antivirus', 'managed device']):
        return 'endpoint'
    # Generic auth fallback (password/authentication without more specifics)
    if any(w in text for w in [' authentication', 'password polic', 'credential', 'sign-in']):
        return 'mfa_auth'

    return 'default'


# ───────────────────────────────────────────────────────────────────────
# Evidence examples — topic-aware for compliance standards
# ───────────────────────────────────────────────────────────────────────
EVIDENCE_TEMPLATES = {
    'default': [
        'Screenshot of configured control in management console',
        'Policy document or procedure signed and dated',
        'Autotask ticket documenting implementation or review',
    ],
    'encryption': [
        'Screenshot of BitLocker/FileVault encryption status across endpoints',
        'Cryptographic key inventory with rotation schedule',
        'TLS/SSL certificate inventory report',
        'Datto RMM compliance report showing encryption status',
    ],
    'mfa_auth': [
        'Screenshot of Entra ID Conditional Access policies',
        'MFA coverage report from identity platform',
        'Privileged account audit showing MFA enforcement',
        'SaaS Alerts sign-in audit log',
    ],
    'patching': [
        'Datto RMM patch compliance report',
        'Autotask ticket showing patch deployment schedule',
        'Vulnerability scan report (before/after remediation)',
    ],
    'backup': [
        'Datto BCDR dashboard showing backup success rates',
        'Most recent restore test ticket with evidence',
        'Backup retention and RPO/RTO policy document',
    ],
    'access_control': [
        'Access review report with sign-off',
        'Privileged access management audit log',
        'IT Glue access documentation per user role',
    ],
    'monitoring': [
        'SIEM/SOC dashboard screenshot showing monitored assets',
        'Sample alert with triage timestamps from last 30 days',
        'SaaS Alerts and EDR coverage report',
    ],
    'policy': [
        'Signed policy document (PDF with signature/approval)',
        'Employee acknowledgment tracking spreadsheet',
        'Policy review schedule and last-review date',
    ],
    'training': [
        'KnowBe4/training completion dashboard screenshot',
        'Training completion certificates',
        'Phish simulation results report',
    ],
    'incident': [
        'Documented IR plan (PDF)',
        'Most recent tabletop exercise after-action report',
        'Incident ticket history with timelines',
    ],
    'physical': [
        'Photos of server room / data center physical controls',
        'Badge access audit log',
        'Camera coverage diagram',
    ],
    'vendor': [
        'Vendor inventory spreadsheet with criticality ratings',
        'Signed vendor security assessment / SOC 2 report',
        'Vendor contract with security clauses highlighted',
    ],
    'inventory': [
        'Datto RMM asset list export',
        'IT Glue configuration inventory',
        'Autotask ConfigurationItems export',
    ],
    'logging': [
        'Log retention policy document',
        'SIEM dashboard screenshot showing covered log sources',
        'Sample audit log export',
    ],
    'network': [
        'Network topology diagram',
        'Firewall rule base export',
        'VLAN / segmentation design document',
    ],
    'endpoint': [
        'Intune / RMM compliance dashboard screenshot',
        'EDR deployment coverage report',
        'Endpoint hardening baseline (CIS / DISA STIG) applied',
    ],
}


# ───────────────────────────────────────────────────────────────────────
# Cluster → master standard
# ───────────────────────────────────────────────────────────────────────

def pick_representative(cluster):
    """Pick the best member to represent the cluster (prefer OPS, then longest name, then first)."""
    ops_members = [q for q in cluster if not q.get('framework')]
    if ops_members:
        return max(ops_members, key=lambda q: len(q.get('question_text', '')))
    return max(cluster, key=lambda q: len(q.get('question_text', '')))


def route_section(rep, cluster):
    """
    Determine which Align section this cluster's master belongs in.
    Rules:
      1. If cluster has any OPS member → use OPS section routing (cross-framework gets operational home)
      2. Else (compliance-only) → framework-specific section
    """
    ops_members = [q for q in cluster if not q.get('framework')]
    if ops_members:
        # OPS or cross-framework — route by operational location
        for m in ops_members:
            sec = m['section']
            cat = m['category']
            # Server Infrastructure section for server-role categories
            if sec == 'Server Infrastructure':
                return 'Server Infrastructure', cat
            key = (sec, cat)
            if key in OPS_SECTION_MAP:
                return OPS_SECTION_MAP[key], cat
        # Fallback: use first ops member's section directly
        m = ops_members[0]
        return m['section'], m['category']

    # Compliance-only cluster
    fw = rep['framework']
    section = FRAMEWORK_SECTION.get(fw, f'Framework: {fw}')
    return section, rep['category']


def priority_level(p):
    m = {'High': 'high', 'Medium': 'medium', 'Low': 'low'}
    return m.get(p, 'medium')


def review_freq(p):
    # Same as existing convention
    return {'High': 'quarterly', 'Medium': 'semi_annual', 'Low': 'annual'}.get(p, 'semi_annual')


def build_master(cluster):
    """Build a master standard dict from a cluster."""
    rep = pick_representative(cluster)
    section_name, category_name = route_section(rep, cluster)

    # Gather framework tags from all cluster members
    fw_tags = {}
    for q in cluster:
        if q.get('framework'):
            # Use the name as the framework_reference (it's the control ID in that framework)
            fw = q['framework']
            if fw not in fw_tags:
                fw_tags[fw] = {
                    'framework': fw,
                    'framework_reference': q.get('name', ''),
                    'framework_evidence': None,
                }

    # Merge why/how text from all members (unique)
    whys = list(dict.fromkeys(filter(None, (q.get('why', '').strip() for q in cluster))))
    hows = list(dict.fromkeys(filter(None, (q.get('how', '').strip() for q in cluster))))

    tpl_key = pick_template(rep)
    responses_raw = RESPONSE_TEMPLATES[tpl_key]
    responses = [
        {'level': 'satisfactory',    'label': 'Satisfactory',    'description': responses_raw['satisfactory'],    'is_aligned': True,  'sort_order': 1},
        {'level': 'acceptable_risk', 'label': 'Acceptable Risk', 'description': responses_raw['acceptable_risk'], 'is_aligned': True,  'sort_order': 2},
        {'level': 'needs_attention', 'label': 'Needs Attention', 'description': responses_raw['needs_attention'], 'is_aligned': False, 'sort_order': 3},
        {'level': 'at_risk',         'label': 'At Risk',         'description': responses_raw['at_risk'],         'is_aligned': False, 'sort_order': 4},
        {'level': 'not_applicable',  'label': 'Not Applicable',  'description': responses_raw['not_applicable'],  'is_aligned': True,  'sort_order': 5},
    ]

    # Evidence examples: only for standards with at least one framework tag
    evidence = EVIDENCE_TEMPLATES.get(tpl_key, EVIDENCE_TEMPLATES['default']) if fw_tags else None

    return {
        'name': rep['name'],
        'description': (whys[0] if whys else '')[:2000],
        'question_text': rep.get('question_text', '')[:2000],
        'business_impact': '\n\n'.join(whys)[:4000] if whys else None,
        'technical_rationale': '\n\n'.join(hows)[:4000] if hows else None,
        'priority': priority_level(rep['priority']),
        'review_frequency': review_freq(rep['priority']),
        'delivery_method': 'remote_human',  # default; can be refined later
        'level_tier': 'level_1',  # default
        'status': 'draft',
        'is_universal': False if fw_tags and not any(not q.get('framework') for q in cluster) else True,
        'section_name': section_name,
        'category_name': category_name,
        'framework_tags': list(fw_tags.values()),
        'responses': responses,
        'evidence_examples': evidence,
        'import_source': 'myitprocess_2026_04_17',
        'import_row_id': str(rep.get('row_id', '')),
    }


# ───────────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────────
def main():
    print('[1] Loading clusters...')
    with open(CLUSTERS_FILE) as f:
        data = json.load(f)
    clusters = data['clusters']
    print(f'    {len(clusters)} clusters')

    print('[2] Building master standards...')
    masters = []
    for c in clusters:
        # Skip clusters that matched existing Align standards (add framework tag only — handled separately)
        if c[0].get('matches_existing_id'):
            continue
        masters.append(build_master(c))
    print(f'    {len(masters)} new master standards')

    # Stats
    by_section = defaultdict(int)
    by_framework = defaultdict(int)
    for m in masters:
        by_section[m['section_name']] += 1
        for tag in m['framework_tags']:
            by_framework[tag['framework']] += 1

    print('\n  Standards per section:')
    for sec, n in sorted(by_section.items(), key=lambda x: -x[1]):
        print(f'    {sec:30s}: {n}')
    print('\n  Framework tags:')
    for fw, n in sorted(by_framework.items()):
        print(f'    {fw:20s}: {n}')

    # Save for inspection
    with open(OUT_JSON, 'w') as f:
        json.dump({'masters': masters, 'counts': {'sections': dict(by_section), 'frameworks': dict(by_framework)}}, f, indent=2)
    print(f'\nWritten: {OUT_JSON}')

    # Spot check
    print('\n─── Spot check: sample of 3 generated standards ───')
    for i in [0, len(masters)//2, len(masters)-1]:
        if i >= len(masters): continue
        m = masters[i]
        print(f'\n  [{i}] {m["name"]} [P={m["priority"]}]')
        print(f'      section:     {m["section_name"]} / {m["category_name"]}')
        print(f'      framework:   {[t["framework"]+":"+t["framework_reference"] for t in m["framework_tags"]] or "none (universal)"}')
        print(f'      question:    {m["question_text"][:120]}')
        print(f'      Sat resp:    {m["responses"][0]["description"]}')
        print(f'      At Risk:     {m["responses"][3]["description"]}')
        if m.get('evidence_examples'):
            print(f'      Evidence:    {m["evidence_examples"][0]}')


if __name__ == '__main__':
    main()
