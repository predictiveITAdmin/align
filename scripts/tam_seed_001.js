/**
 * TAM Standards Library — Seed Script v1.0
 * Seeds: 12 domains, ~55 categories, 134 universal standards, 670 responses
 */
const { Pool } = require('pg')
const pool = new Pool({
  host: '10.168.2.46', port: 5432, database: 'align',
  user: 'n8n', password: '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'
})

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Get tenant_id ──
    const t = await client.query('SELECT DISTINCT tenant_id FROM standard_sections LIMIT 1')
    const tenantId = t.rows[0]?.tenant_id
    if (!tenantId) throw new Error('No tenant_id found in standard_sections')
    console.log('Tenant:', tenantId)

    // ── Clear existing data (CASCADE handles FKs) ──
    await client.query('DELETE FROM standard_responses WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM standard_framework_tags WHERE standard_id IN (SELECT id FROM standards WHERE tenant_id = $1)', [tenantId])
    await client.query('DELETE FROM standard_vertical_tags WHERE standard_id IN (SELECT id FROM standards WHERE tenant_id = $1)', [tenantId])
    await client.query('DELETE FROM standard_tech_tags WHERE standard_id IN (SELECT id FROM standards WHERE tenant_id = $1)', [tenantId])
    await client.query('DELETE FROM standards WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM standard_categories WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM standard_sections WHERE tenant_id = $1', [tenantId])
    console.log('Cleared existing data')

    // ── Seed Domains (standard_sections) ──
    const domains = [
      { name: 'Endpoint Management', slug: 'endpoint', desc: 'Workstations, laptops, mobile devices, and endpoint security', sort: 1 },
      { name: 'Network Infrastructure', slug: 'network', desc: 'Firewalls, switches, wireless, connectivity, and network security', sort: 2 },
      { name: 'Identity & Access', slug: 'identity', desc: 'Identity platforms, MFA, privileged access, and user lifecycle', sort: 3 },
      { name: 'Security Operations', slug: 'security', desc: 'Email security, SIEM/SOC, vulnerability management, awareness training', sort: 4 },
      { name: 'Backup & Disaster Recovery', slug: 'backup_dr', desc: 'Backup strategy, immutability, testing, RTO/RPO, DR planning', sort: 5 },
      { name: 'Cloud & Applications', slug: 'cloud', desc: 'Microsoft 365, SaaS governance, application lifecycle', sort: 6 },
      { name: 'Documentation & Operations', slug: 'documentation', desc: 'IT Glue, PSA, service management, lifecycle management', sort: 7 },
      { name: 'Physical & Environmental', slug: 'physical', desc: 'Server room, power management, physical security controls', sort: 8 },
      { name: 'Compliance & Policy', slug: 'compliance', desc: 'Security policies, insurance, compliance readiness', sort: 9 },
      { name: 'Business Alignment & Governance', slug: 'business', desc: 'Strategic engagement, service governance, IT financial planning', sort: 10 },
      { name: 'Remote Work & Access', slug: 'remote', desc: 'Remote access controls, home network security, WFH policies', sort: 11 },
      { name: 'Third-Party Risk', slug: 'tpra', desc: 'Vendor inventory, contracts, agreements, vendor security assessment', sort: 12 },
    ]

    const domainMap = {}
    for (const d of domains) {
      const r = await client.query(
        `INSERT INTO standard_sections (tenant_id, name, slug, description, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, d.name, d.slug, d.desc, d.sort]
      )
      domainMap[d.slug] = r.rows[0].id
    }
    console.log(`Seeded ${domains.length} domains`)

    // ── Seed Categories ──
    const categories = [
      // Endpoint Management
      { domain: 'endpoint', name: 'Remote Management & Monitoring', slug: 'rmm', freq: 1, sort: 1 },
      { domain: 'endpoint', name: 'Endpoint Security Posture', slug: 'endpoint_security', freq: 1, sort: 2 },
      { domain: 'endpoint', name: 'Endpoint Configuration & Standards', slug: 'endpoint_config', freq: 3, sort: 3 },
      { domain: 'endpoint', name: 'Endpoint Lifecycle & Refresh', slug: 'endpoint_lifecycle', freq: 6, sort: 4 },
      // Network Infrastructure
      { domain: 'network', name: 'Firewall & Perimeter Security', slug: 'firewall', freq: 2, sort: 1 },
      { domain: 'network', name: 'Switching & Wireless', slug: 'switching_wireless', freq: 6, sort: 2 },
      { domain: 'network', name: 'Connectivity & Monitoring', slug: 'net_monitoring', freq: 3, sort: 3 },
      // Identity & Access
      { domain: 'identity', name: 'Identity Platform', slug: 'identity_platform', freq: 3, sort: 1 },
      { domain: 'identity', name: 'MFA & Conditional Access', slug: 'mfa', freq: 1, sort: 2 },
      { domain: 'identity', name: 'Privileged Access & Account Management', slug: 'pam', freq: 3, sort: 3 },
      { domain: 'identity', name: 'User Lifecycle', slug: 'user_lifecycle', freq: 3, sort: 4 },
      // Security Operations
      { domain: 'security', name: 'Email Security', slug: 'email_security', freq: 1, sort: 1 },
      { domain: 'security', name: 'DNS & Web Security', slug: 'dns_security', freq: 3, sort: 2 },
      { domain: 'security', name: 'SIEM & SOC Monitoring', slug: 'siem_soc', freq: 1, sort: 3 },
      { domain: 'security', name: 'Vulnerability Management', slug: 'vuln_mgmt', freq: 1, sort: 4 },
      { domain: 'security', name: 'Security Awareness & Training', slug: 'security_training', freq: 3, sort: 5 },
      { domain: 'security', name: 'Dark Web & Threat Intelligence', slug: 'dark_web', freq: 3, sort: 6 },
      { domain: 'security', name: 'Incident Response', slug: 'incident_response', freq: 12, sort: 7 },
      // Backup & DR
      { domain: 'backup_dr', name: 'On-Prem / BDR Backup', slug: 'onprem_backup', freq: 1, sort: 1 },
      { domain: 'backup_dr', name: 'M365 / Cloud Backup', slug: 'cloud_backup', freq: 1, sort: 2 },
      { domain: 'backup_dr', name: 'Recovery Testing & DR', slug: 'recovery_dr', freq: 3, sort: 3 },
      // Cloud & Applications
      { domain: 'cloud', name: 'Microsoft 365 Administration', slug: 'm365_admin', freq: 3, sort: 1 },
      { domain: 'cloud', name: 'SaaS Governance', slug: 'saas_gov', freq: 3, sort: 2 },
      { domain: 'cloud', name: 'Application Management', slug: 'app_mgmt', freq: 6, sort: 3 },
      // Documentation & Operations
      { domain: 'documentation', name: 'IT Glue Documentation', slug: 'itglue', freq: 3, sort: 1 },
      { domain: 'documentation', name: 'PSA & Service Management', slug: 'psa', freq: 3, sort: 2 },
      { domain: 'documentation', name: 'Lifecycle Management', slug: 'lifecycle_mgmt', freq: 3, sort: 3 },
      // Physical & Environmental
      { domain: 'physical', name: 'Server Room / Comms Closet', slug: 'server_room', freq: 6, sort: 1 },
      { domain: 'physical', name: 'Physical Security', slug: 'physical_security', freq: 12, sort: 2 },
      // Compliance & Policy
      { domain: 'compliance', name: 'Core Security Policies', slug: 'core_policies', freq: 12, sort: 1 },
      { domain: 'compliance', name: 'Insurance & Legal', slug: 'insurance', freq: 12, sort: 2 },
      { domain: 'compliance', name: 'Compliance Readiness', slug: 'compliance_readiness', freq: 6, sort: 3 },
      // Business Alignment
      { domain: 'business', name: 'Strategic Engagement', slug: 'strategic', freq: 3, sort: 1 },
      { domain: 'business', name: 'Service Governance', slug: 'service_gov', freq: 3, sort: 2 },
      // Remote Work & Access
      { domain: 'remote', name: 'Remote Access Controls', slug: 'remote_access', freq: 6, sort: 1 },
      // Third-Party Risk (deferred UI but seed categories)
      { domain: 'tpra', name: 'Vendor Inventory & Classification', slug: 'vendor_inventory', freq: 12, sort: 1 },
      { domain: 'tpra', name: 'Vendor Contracts & Agreements', slug: 'vendor_contracts', freq: 12, sort: 2 },
      { domain: 'tpra', name: 'Vendor Security Assessment', slug: 'vendor_security', freq: 12, sort: 3 },
    ]

    const catMap = {}
    for (const c of categories) {
      const r = await client.query(
        `INSERT INTO standard_categories (tenant_id, section_id, name, slug, description, review_frequency_months, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
        [tenantId, domainMap[c.domain], c.name, c.slug, null, c.freq, c.sort]
      )
      catMap[c.slug] = r.rows[0].id
    }
    console.log(`Seeded ${categories.length} categories`)

    // ── Helper: insert standard + 5 responses ──
    async function addStandard(catSlug, std) {
      const r = await client.query(
        `INSERT INTO standards (
          tenant_id, category_id, name, description, question_text,
          priority, is_universal, level_tier, delivery_method, user_impact_tag,
          status, source, is_active, sort_order, severity_weight
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved','seed',true,$11,1.0) RETURNING id`,
        [
          tenantId, catMap[catSlug], std.name, std.name, std.name,
          std.priority, true, std.tier, std.delivery, 'no_user_impact', std.sort
        ]
      )
      const sid = r.rows[0].id

      // 5 standard responses
      const responses = [
        { level: 'satisfactory', label: 'Satisfactory', aligned: true, sort: 1,
          desc: std.resp_sat || 'Control is fully implemented, monitored, and documented.' },
        { level: 'acceptable_risk', label: 'Acceptable Risk', aligned: true, sort: 2,
          desc: std.resp_ar || 'Control is implemented with minor gaps accepted by management.' },
        { level: 'needs_attention', label: 'Needs Attention', aligned: false, sort: 3,
          desc: std.resp_na || 'Control is partially implemented or has known gaps requiring remediation.' },
        { level: 'at_risk', label: 'At Risk', aligned: false, sort: 4,
          desc: std.resp_risk || 'Control is not implemented, expired, or critically deficient.' },
        { level: 'not_applicable', label: 'Not Applicable', aligned: true, sort: 5,
          desc: std.resp_notapp || 'This control does not apply to this client\'s environment.' },
      ]

      for (const resp of responses) {
        await client.query(
          `INSERT INTO standard_responses (tenant_id, standard_id, level, label, description, is_aligned, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, sid, resp.level, resp.label, resp.desc, resp.aligned, resp.sort]
        )
      }
      return sid
    }

    let count = 0

    // ────────────────────────────────────────────────────────────
    // Domain 1: Endpoint Management (18 standards)
    // ────────────────────────────────────────────────────────────

    // Remote Management & Monitoring
    await addStandard('rmm', { name: 'RMM agent installed on all managed endpoints', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'RMM agent is deployed on 100% of managed endpoints with active check-in.',
      resp_ar: 'RMM agent deployed on 95%+ endpoints; remaining devices identified and scheduled.',
      resp_na: 'RMM agent missing on multiple endpoints; deployment gaps not tracked.',
      resp_risk: 'RMM agent not deployed or significantly missing across the environment.' }); count++
    await addStandard('rmm', { name: 'RMM agent checking in (online) on all managed endpoints', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'All managed endpoints show active check-in within the last 24 hours.',
      resp_ar: '95%+ endpoints checking in; offline devices identified and being investigated.',
      resp_na: 'Multiple endpoints offline or not checking in; no active investigation.',
      resp_risk: 'Significant number of endpoints offline with no visibility or remediation plan.' }); count++
    await addStandard('rmm', { name: 'RMM monitoring policies applied per client standard', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'Standardized monitoring policies applied to all devices per client tier.',
      resp_ar: 'Monitoring policies applied but minor customizations pending.',
      resp_na: 'Monitoring policies partially applied or using defaults.',
      resp_risk: 'No standardized monitoring policies applied; using generic defaults.' }); count++
    await addStandard('rmm', { name: 'RMM site/client correctly assigned (no orphan devices)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'All devices correctly assigned to their client site with no orphans.',
      resp_ar: 'Minor orphan devices identified and being reassigned.',
      resp_na: 'Multiple devices misassigned or orphaned across sites.',
      resp_risk: 'Significant device misassignment; no site hygiene process.' }); count++

    // Endpoint Security Posture
    await addStandard('endpoint_security', { name: 'EDR/AV solution deployed on all managed endpoints', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'EDR/AV deployed and active on 100% of managed endpoints.',
      resp_ar: 'EDR/AV deployed on 95%+ endpoints; remaining scheduled for deployment.',
      resp_na: 'EDR/AV missing on multiple endpoints; deployment gaps exist.',
      resp_risk: 'No EDR/AV deployed or critically missing across the environment.' }); count++
    await addStandard('endpoint_security', { name: 'EDR/AV definitions current (updated within 24 hours)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'All endpoint definitions updated within the last 24 hours.',
      resp_ar: 'Definitions current on 95%+ endpoints; stragglers identified.',
      resp_na: 'Multiple endpoints have stale definitions (>48 hours).',
      resp_risk: 'Definitions significantly outdated across the fleet.' }); count++
    await addStandard('endpoint_security', { name: 'EDR/AV real-time protection active (not disabled)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'Real-time protection verified active on all endpoints.',
      resp_ar: 'Real-time protection active on 95%+ endpoints.',
      resp_na: 'Real-time protection disabled on multiple endpoints.',
      resp_risk: 'Real-time protection broadly disabled or not monitored.' }); count++
    await addStandard('endpoint_security', { name: 'Disk encryption (BitLocker/FileVault) enabled on all endpoints', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'Full disk encryption enabled and verified on all endpoints.',
      resp_ar: 'Encryption enabled on 95%+ endpoints; remaining scheduled.',
      resp_na: 'Encryption not enabled on multiple endpoints.',
      resp_risk: 'No disk encryption deployed; data at risk if devices are lost/stolen.' }); count++
    await addStandard('endpoint_security', { name: 'BitLocker recovery keys escrowed to Entra ID / IT Glue', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 5,
      resp_sat: 'All recovery keys escrowed and accessible in Entra ID or IT Glue.',
      resp_ar: 'Most keys escrowed; minor gaps being remediated.',
      resp_na: 'Recovery keys not consistently escrowed; risk of lockout.',
      resp_risk: 'No key escrow process; recovery keys unknown or lost.' }); count++
    await addStandard('endpoint_security', { name: 'Local administrator accounts restricted (standard users for daily use)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 6,
      resp_sat: 'Users operate as standard users; local admin restricted to IT only.',
      resp_ar: 'Most users are standard; a few exceptions documented and accepted.',
      resp_na: 'Multiple users have local admin; no restriction policy enforced.',
      resp_risk: 'Users broadly operate as local administrators.' }); count++

    // Endpoint Configuration & Standards
    await addStandard('endpoint_config', { name: 'Operating system is vendor-supported (not EOL)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'All endpoints running vendor-supported OS versions.',
      resp_ar: 'Minor EOL devices identified with replacement scheduled.',
      resp_na: 'Multiple endpoints running EOL operating systems.',
      resp_risk: 'Significant portion of fleet on unsupported OS.' }); count++
    await addStandard('endpoint_config', { name: 'OS patches applied within 30 days of release (critical within 14 days)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'Patch compliance ≥95% within defined windows.',
      resp_ar: 'Patch compliance 85-94%; improvement plan in place.',
      resp_na: 'Patch compliance 70-84%; patching inconsistent.',
      resp_risk: 'Patch compliance below 70%; critical patches significantly delayed.' }); count++
    await addStandard('endpoint_config', { name: 'Application patches applied within 30 days of release', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'Third-party application patches current across fleet.',
      resp_ar: 'Most applications patched; minor gaps tracked.',
      resp_na: 'Application patching inconsistent; several apps outdated.',
      resp_risk: 'No third-party patch management process.' }); count++
    await addStandard('endpoint_config', { name: 'Endpoint meets minimum hardware specification (i5 8th gen+, 16GB RAM, 256GB SSD)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'All endpoints meet or exceed minimum hardware specifications.',
      resp_ar: 'Most endpoints meet spec; underspec devices on refresh plan.',
      resp_na: 'Multiple endpoints below minimum spec affecting performance.',
      resp_risk: 'Significant hardware deficiencies across the fleet.' }); count++
    await addStandard('endpoint_config', { name: 'Screen lock enforced after 15 minutes of inactivity', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 5,
      resp_sat: 'Screen lock policy enforced via GPO/Intune on all endpoints.',
      resp_ar: 'Screen lock configured but minor enforcement gaps.',
      resp_na: 'Screen lock not consistently enforced.',
      resp_risk: 'No screen lock policy; endpoints remain unlocked.' }); count++

    // Endpoint Lifecycle & Refresh
    await addStandard('endpoint_lifecycle', { name: 'All endpoints within 5-year lifecycle (refresh plan documented)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'All endpoints within lifecycle; refresh plan documented and funded.',
      resp_ar: 'Minor devices approaching lifecycle end; refresh plan exists.',
      resp_na: 'Multiple devices past lifecycle; refresh plan incomplete.',
      resp_risk: 'Significant aging fleet with no documented refresh plan.' }); count++
    await addStandard('endpoint_lifecycle', { name: 'All endpoints under active manufacturer warranty', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'All endpoints under active warranty.',
      resp_ar: 'Most endpoints warranted; expired warranties identified.',
      resp_na: 'Multiple endpoints out of warranty.',
      resp_risk: 'Majority of endpoints have no warranty coverage.' }); count++
    await addStandard('endpoint_lifecycle', { name: 'Spare device inventory maintained for rapid replacement', priority: 'low', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Spare inventory maintained; replacement SLA documented.',
      resp_ar: 'Limited spares available; procurement process defined.',
      resp_na: 'No spare inventory; replacement relies on ad-hoc procurement.',
      resp_risk: 'No spares and no procurement process; extended downtime risk.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 2: Network Infrastructure (16 standards)
    // ────────────────────────────────────────────────────────────

    // Firewall & Perimeter Security
    await addStandard('firewall', { name: 'Enterprise-grade firewall deployed (not consumer router/modem)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Enterprise firewall deployed at all client sites.',
      resp_ar: 'Enterprise firewall at primary site; secondary sites pending.',
      resp_na: 'Consumer-grade router in use at one or more sites.',
      resp_risk: 'No enterprise firewall; using ISP modem/router for perimeter security.' }); count++
    await addStandard('firewall', { name: 'Firewall under active vendor subscription (security services, updates)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All security subscriptions (IPS, AMP, WCF) active and current.',
      resp_ar: 'Core subscriptions active; advanced features pending renewal.',
      resp_na: 'Subscriptions expired or partially active.',
      resp_risk: 'No active subscriptions; firewall operating without security services.' }); count++
    await addStandard('firewall', { name: 'Firewall firmware is current (within one major version)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Firmware current and set to auto-update.',
      resp_ar: 'Firmware one minor version behind; update scheduled.',
      resp_na: 'Firmware significantly outdated.',
      resp_risk: 'Firmware multiple versions behind with known vulnerabilities.' }); count++
    await addStandard('firewall', { name: 'Firewall not within 6 months of end-of-life', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Firewall fully supported with 12+ months until EOL.',
      resp_ar: 'Firewall supported but approaching EOL within 12 months.',
      resp_na: 'Firewall within 6 months of EOL; replacement not yet planned.',
      resp_risk: 'Firewall past EOL or no longer receiving security updates.' }); count++
    await addStandard('firewall', { name: 'Firewall management interface access restricted to trusted networks', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 5,
      resp_sat: 'Management access restricted to PIT trusted IPs only.',
      resp_ar: 'Management access mostly restricted; minor gaps.',
      resp_na: 'Management access not fully restricted.',
      resp_risk: 'Management interface accessible from any network.' }); count++
    await addStandard('firewall', { name: 'Default credentials changed on all network devices', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 6,
      resp_sat: 'All default credentials changed and documented in IT Glue.',
      resp_ar: 'Most credentials changed; a few legacy devices pending.',
      resp_na: 'Default credentials still in use on some devices.',
      resp_risk: 'Default credentials widely in use; significant security risk.' }); count++
    await addStandard('firewall', { name: 'Content filtering / web category filtering active', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 7,
      resp_sat: 'Content filtering active and policies configured per standard.',
      resp_ar: 'Content filtering active with basic policies.',
      resp_na: 'Content filtering configured but not optimized.',
      resp_risk: 'No content filtering in place.' }); count++
    await addStandard('firewall', { name: 'IDS/IPS enabled on firewall (where supported)', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 8,
      resp_sat: 'IDS/IPS fully enabled with policies tuned.',
      resp_ar: 'IDS/IPS enabled with default policies.',
      resp_na: 'IDS/IPS available but not enabled.',
      resp_risk: 'No IDS/IPS capability or licensing.' }); count++

    // Switching & Wireless
    await addStandard('switching_wireless', { name: 'Enterprise-grade switches deployed (not consumer-grade)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Enterprise managed switches at all sites.',
      resp_ar: 'Enterprise switches at primary site; secondary sites being upgraded.',
      resp_na: 'Mix of consumer and enterprise switches.',
      resp_risk: 'Consumer-grade unmanaged switches in use.' }); count++
    await addStandard('switching_wireless', { name: 'Switch firmware current and not EOL', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All switches running current firmware and within support lifecycle.',
      resp_ar: 'Minor firmware updates pending; all within lifecycle.',
      resp_na: 'Some switches running outdated firmware or approaching EOL.',
      resp_risk: 'Switches past EOL with no update path.' }); count++
    await addStandard('switching_wireless', { name: 'Enterprise-grade wireless access points deployed', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Enterprise APs deployed with centralized management.',
      resp_ar: 'Enterprise APs deployed; management consolidation in progress.',
      resp_na: 'Mix of consumer and enterprise wireless equipment.',
      resp_risk: 'Consumer-grade wireless only; no centralized management.' }); count++
    await addStandard('switching_wireless', { name: 'Wireless secured with WPA2/WPA3 enterprise encryption', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'WPA2/WPA3 Enterprise with RADIUS/AD integration.',
      resp_ar: 'WPA2 Personal with strong PSK; enterprise upgrade planned.',
      resp_na: 'WPA2 Personal with weak or shared PSK.',
      resp_risk: 'Open or WEP-secured wireless networks.' }); count++
    await addStandard('switching_wireless', { name: 'Guest wireless separated from corporate network (separate VLAN)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 5,
      resp_sat: 'Guest network on dedicated VLAN with no access to corporate resources.',
      resp_ar: 'Guest network exists but VLAN isolation needs verification.',
      resp_na: 'Guest network exists but not properly isolated.',
      resp_risk: 'No guest network; visitors use corporate SSID.' }); count++
    await addStandard('switching_wireless', { name: 'VLANs deployed for network segmentation', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 6,
      resp_sat: 'VLANs configured for logical segmentation (servers, users, IoT, guest).',
      resp_ar: 'Basic VLANs in place; additional segmentation planned.',
      resp_na: 'Minimal or no VLAN segmentation.',
      resp_risk: 'Flat network with no segmentation.' }); count++

    // Connectivity & Monitoring
    await addStandard('net_monitoring', { name: 'Network monitoring active (Auvik or equivalent)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'Network monitoring active with alerts integrated into PSA.',
      resp_ar: 'Network monitoring active; alerting configuration being tuned.',
      resp_na: 'Network monitoring deployed but not actively maintained.',
      resp_risk: 'No network monitoring in place.' }); count++
    await addStandard('net_monitoring', { name: 'Network diagram current and documented (IT Glue)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Network diagram current, published in IT Glue, reviewed quarterly.',
      resp_ar: 'Network diagram exists but may have minor inaccuracies.',
      resp_na: 'Network diagram outdated or incomplete.',
      resp_risk: 'No network diagram exists.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 3: Identity & Access (14 standards)
    // ────────────────────────────────────────────────────────────

    // Identity Platform
    await addStandard('identity_platform', { name: 'Centralized identity platform deployed (Entra ID or Google Workspace)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Centralized identity platform deployed; all users authenticated through it.',
      resp_ar: 'Identity platform deployed; minor integration gaps.',
      resp_na: 'Identity platform partially deployed; some users not integrated.',
      resp_risk: 'No centralized identity platform; local accounts only.' }); count++
    await addStandard('identity_platform', { name: 'All user accounts authenticated through centralized identity', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All user accounts federated through central IdP.',
      resp_ar: 'Most accounts federated; a few legacy accounts remain.',
      resp_na: 'Multiple accounts outside central IdP.',
      resp_risk: 'No centralized authentication; accounts fragmented.' }); count++
    await addStandard('identity_platform', { name: 'Hybrid AD sync configured and healthy (if applicable)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'AD Connect sync healthy; running on schedule with no errors.',
      resp_ar: 'Sync running with minor warnings under investigation.',
      resp_na: 'Sync experiencing errors or inconsistencies.',
      resp_risk: 'Sync broken or not configured where required.',
      resp_notapp: 'Cloud-only identity; no on-prem AD to sync.' }); count++

    // MFA & Conditional Access
    await addStandard('mfa', { name: 'MFA enforced on all user accounts', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'MFA enforced on 100% of user accounts.',
      resp_ar: 'MFA on 95%+ accounts; remaining being onboarded.',
      resp_na: 'MFA not enforced on all accounts.',
      resp_risk: 'MFA not deployed or widely bypassed.' }); count++
    await addStandard('mfa', { name: 'MFA enforced on all administrator accounts', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'All admin accounts have MFA enforced with phishing-resistant methods.',
      resp_ar: 'MFA on all admin accounts; method upgrade planned.',
      resp_na: 'Some admin accounts lack MFA.',
      resp_risk: 'Admin accounts accessible without MFA.' }); count++
    await addStandard('mfa', { name: 'MFA enforced on remote/VPN access', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'All remote access requires MFA at authentication.',
      resp_ar: 'MFA on primary VPN; secondary access points being secured.',
      resp_na: 'MFA not consistently enforced on all remote access.',
      resp_risk: 'Remote access available without MFA.' }); count++
    await addStandard('mfa', { name: 'MFA enforced on backup system access', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Backup system console access requires MFA.',
      resp_ar: 'MFA configured; minor access paths being secured.',
      resp_na: 'Backup system partially secured with MFA.',
      resp_risk: 'Backup system accessible without MFA.' }); count++
    await addStandard('mfa', { name: 'Conditional access policies configured (Entra ID)', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 5,
      resp_sat: 'Conditional access policies configured and actively enforced.',
      resp_ar: 'Basic conditional access policies in place.',
      resp_na: 'Conditional access available but not configured.',
      resp_risk: 'No conditional access configured; relying on basic auth only.',
      resp_notapp: 'Client does not use Entra ID / Azure AD.' }); count++

    // Privileged Access & Account Management
    await addStandard('pam', { name: 'Admin accounts separated from daily-use accounts', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'All admins use separate privileged accounts for admin tasks.',
      resp_ar: 'Most admins use separate accounts; a few dual-use accounts remain.',
      resp_na: 'Admin separation policy exists but not consistently followed.',
      resp_risk: 'Admins use daily accounts for privileged operations.' }); count++
    await addStandard('pam', { name: 'Password policy enforced (complexity + length requirements)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'Password policy enforced (14+ chars, complexity, expiration) via GPO/Intune.',
      resp_ar: 'Password policy enforced with minor gaps (e.g., length below 14).',
      resp_na: 'Password policy exists but not enforced technically.',
      resp_risk: 'No password policy enforced; weak passwords in use.' }); count++
    await addStandard('pam', { name: 'Dormant/inactive accounts disabled within 45 days', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Automated process disables accounts after 45 days of inactivity.',
      resp_ar: 'Manual review performed quarterly; dormant accounts disabled.',
      resp_na: 'Dormant accounts identified but not consistently disabled.',
      resp_risk: 'No dormant account review; stale accounts active.' }); count++

    // User Lifecycle
    await addStandard('user_lifecycle', { name: 'New user onboarding procedure documented and followed', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Documented onboarding procedure followed for every new hire.',
      resp_ar: 'Procedure exists and mostly followed; minor inconsistencies.',
      resp_na: 'Procedure exists but not consistently followed.',
      resp_risk: 'No documented onboarding procedure.' }); count++
    await addStandard('user_lifecycle', { name: 'User offboarding/termination procedure documented and followed', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Documented offboarding procedure with same-day account disable.',
      resp_ar: 'Procedure exists; occasional delays in execution.',
      resp_na: 'Procedure exists but not consistently followed; access lingers.',
      resp_risk: 'No documented offboarding; terminated users retain access.' }); count++
    await addStandard('user_lifecycle', { name: 'Access reviews conducted at least semi-annually', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 3,
      resp_sat: 'Access reviews conducted semi-annually with documented results.',
      resp_ar: 'Access reviews conducted annually.',
      resp_na: 'Access reviews planned but not yet conducted.',
      resp_risk: 'No access reviews performed.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 4: Security Operations (22 standards)
    // ────────────────────────────────────────────────────────────

    // Email Security
    await addStandard('email_security', { name: 'Advanced email filtering active (Inky / Defender for Office 365)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Advanced email filtering deployed and actively protecting all mailboxes.',
      resp_ar: 'Email filtering active; tuning/optimization in progress.',
      resp_na: 'Basic email filtering only; no advanced threat protection.',
      resp_risk: 'No email filtering beyond native platform defaults.' }); count++
    await addStandard('email_security', { name: 'SPF record configured correctly', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'SPF record configured and validated for all sending sources.',
      resp_ar: 'SPF record exists but may have minor gaps.',
      resp_na: 'SPF record misconfigured or incomplete.',
      resp_risk: 'No SPF record configured.' }); count++
    await addStandard('email_security', { name: 'DKIM configured and active', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'DKIM signing active and validated for all domains.',
      resp_ar: 'DKIM active for primary domain; secondary domains pending.',
      resp_na: 'DKIM partially configured.',
      resp_risk: 'No DKIM configured.' }); count++
    await addStandard('email_security', { name: 'DMARC policy configured (minimum p=quarantine)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'DMARC at p=reject with monitoring active.',
      resp_ar: 'DMARC at p=quarantine.',
      resp_na: 'DMARC at p=none (monitoring only).',
      resp_risk: 'No DMARC record configured.' }); count++
    await addStandard('email_security', { name: 'External email tagging / banner enabled', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 5,
      resp_sat: 'External email banner/tag active on all inbound external messages.',
      resp_ar: 'External tagging enabled; minor formatting adjustments needed.',
      resp_na: 'External tagging not yet configured.',
      resp_risk: 'No external email identification in place.' }); count++

    // DNS & Web Security
    await addStandard('dns_security', { name: 'DNS filtering active on all endpoints (Umbrella / firewall WCF)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'DNS filtering deployed on all endpoints and enforced.',
      resp_ar: 'DNS filtering on most endpoints; gaps being closed.',
      resp_na: 'DNS filtering partially deployed.',
      resp_risk: 'No DNS filtering in place.' }); count++
    await addStandard('dns_security', { name: 'DNS filtering policies configured to block malicious categories', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Policies configured to block malware, phishing, and inappropriate categories.',
      resp_ar: 'Basic blocking policies in place; fine-tuning needed.',
      resp_na: 'Filtering enabled but policies not properly configured.',
      resp_risk: 'No blocking policies configured.' }); count++

    // SIEM & SOC Monitoring
    await addStandard('siem_soc', { name: 'SIEM/MDR platform active (RocketCyber / Blumira)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'SIEM/MDR platform active with 24x7 monitoring.',
      resp_ar: 'SIEM deployed; SOC coverage being finalized.',
      resp_na: 'SIEM deployed but not fully operational.',
      resp_risk: 'No SIEM or MDR platform in place.' }); count++
    await addStandard('siem_soc', { name: 'Critical log sources forwarding to SIEM', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All critical log sources (firewall, AD, M365, endpoints) forwarding.',
      resp_ar: 'Most critical sources forwarding; minor gaps.',
      resp_na: 'Limited log sources configured.',
      resp_risk: 'No log sources forwarding to SIEM.' }); count++
    await addStandard('siem_soc', { name: '24x7 SOC monitoring active with alerting', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: '24x7 SOC monitoring active with defined alerting and escalation.',
      resp_ar: 'SOC monitoring active during business hours; after-hours coverage planned.',
      resp_na: 'SOC monitoring partially configured.',
      resp_risk: 'No SOC monitoring or alerting.' }); count++
    await addStandard('siem_soc', { name: 'SOC alerts integrated into PSA ticketing', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'SOC alerts auto-create tickets in Autotask with proper categorization.',
      resp_ar: 'SOC integration active; ticket categorization being tuned.',
      resp_na: 'SOC alerts require manual ticket creation.',
      resp_risk: 'No integration between SOC and PSA.' }); count++

    // Vulnerability Management
    await addStandard('vuln_mgmt', { name: 'Patch compliance ≥95% within 30 days (OS)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'OS patch compliance ≥95% within 30 days.',
      resp_ar: 'Patch compliance 85-94%; improvement plan in place.',
      resp_na: 'Patch compliance 70-84%.',
      resp_risk: 'Patch compliance below 70%.' }); count++
    await addStandard('vuln_mgmt', { name: 'Patch compliance ≥90% within 30 days (third-party apps)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'Third-party patch compliance ≥90%.',
      resp_ar: 'Third-party patch compliance 80-89%.',
      resp_na: 'Third-party patch compliance 60-79%.',
      resp_risk: 'No third-party patching process or below 60% compliance.' }); count++
    await addStandard('vuln_mgmt', { name: 'Vulnerability scanning performed quarterly (minimum)', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 3,
      resp_sat: 'Quarterly vulnerability scans with remediation tracking.',
      resp_ar: 'Scans performed semi-annually.',
      resp_na: 'Scans performed annually or ad-hoc.',
      resp_risk: 'No vulnerability scanning program.' }); count++

    // Security Awareness & Training
    await addStandard('security_training', { name: 'Security awareness training platform active (BullPhish / BSN)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Training platform deployed and actively used.',
      resp_ar: 'Platform deployed; enrollment in progress.',
      resp_na: 'Platform available but underutilized.',
      resp_risk: 'No security awareness training platform.' }); count++
    await addStandard('security_training', { name: 'All users enrolled in security awareness training', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: '100% of users enrolled and active.',
      resp_ar: '90%+ enrolled; remaining users being onboarded.',
      resp_na: 'Less than 90% enrollment.',
      resp_risk: 'Less than 50% enrollment or no enrollment process.' }); count++
    await addStandard('security_training', { name: 'Phishing simulation campaigns running (monthly minimum)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Monthly phishing simulations running with results tracked.',
      resp_ar: 'Simulations running quarterly.',
      resp_na: 'Simulations configured but not running regularly.',
      resp_risk: 'No phishing simulation program.' }); count++
    await addStandard('security_training', { name: 'Training completion rate ≥90%', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'Training completion rate ≥90% across all users.',
      resp_ar: 'Completion rate 80-89%.',
      resp_na: 'Completion rate 60-79%.',
      resp_risk: 'Completion rate below 60%.' }); count++

    // Dark Web & Threat Intelligence
    await addStandard('dark_web', { name: 'Dark web monitoring active (DarkWeb ID / BSN)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Dark web monitoring active with alerting and remediation workflow.',
      resp_ar: 'Monitoring active; remediation process being formalized.',
      resp_na: 'Monitoring deployed but not actively reviewed.',
      resp_risk: 'No dark web monitoring.' }); count++
    await addStandard('dark_web', { name: 'Domain(s) monitored for credential exposure', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All client domains monitored with active alert processing.',
      resp_ar: 'Primary domain monitored; secondary domains being added.',
      resp_na: 'Domain monitoring configured but alerts not processed.',
      resp_risk: 'No domain monitoring for credential exposure.' }); count++

    // Incident Response
    await addStandard('incident_response', { name: 'Incident response plan documented', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'IR plan documented, distributed, and accessible to key stakeholders.',
      resp_ar: 'IR plan documented but needs review/update.',
      resp_na: 'IR plan in draft or incomplete.',
      resp_risk: 'No incident response plan exists.' }); count++
    await addStandard('incident_response', { name: 'IR plan reviewed/tested annually (tabletop or walkthrough)', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 2,
      resp_sat: 'IR plan tested annually via tabletop exercise with documented results.',
      resp_ar: 'IR plan reviewed annually; tabletop planned.',
      resp_na: 'IR plan exists but not tested.',
      resp_risk: 'No IR plan testing or review.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 5: Backup & DR (14 standards)
    // ────────────────────────────────────────────────────────────

    // On-Prem / BDR Backup
    await addStandard('onprem_backup', { name: 'Automated backup solution deployed (Veeam / Unitrends)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Enterprise backup solution deployed and managing all critical systems.',
      resp_ar: 'Backup solution deployed; minor systems being added.',
      resp_na: 'Backup solution partially deployed.',
      resp_risk: 'No automated backup solution deployed.' }); count++
    await addStandard('onprem_backup', { name: 'Backup running on automated schedule (nightly minimum)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 2,
      resp_sat: 'Automated backups running on schedule with monitoring.',
      resp_ar: 'Backups scheduled; occasional manual intervention needed.',
      resp_na: 'Backups running but not reliably.',
      resp_risk: 'No automated backup schedule.' }); count++
    await addStandard('onprem_backup', { name: 'Backup success rate ≥95% over last 30 days', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'Backup success rate ≥95% over last 30 days.',
      resp_ar: 'Backup success rate 85-94%; issues being addressed.',
      resp_na: 'Backup success rate 70-84%.',
      resp_risk: 'Backup success rate below 70%.' }); count++
    await addStandard('onprem_backup', { name: 'Offsite/cloud backup replication active (Backblaze / vendor cloud)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 4,
      resp_sat: 'Offsite replication active and verified.',
      resp_ar: 'Offsite replication configured; verification pending.',
      resp_na: 'Offsite replication available but not configured.',
      resp_risk: 'No offsite backup replication; single point of failure.' }); count++
    await addStandard('onprem_backup', { name: 'Backup immutability enabled (ransomware protection)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 5,
      resp_sat: 'Backup immutability enabled and verified.',
      resp_ar: 'Immutability configured; testing in progress.',
      resp_na: 'Immutability available but not enabled.',
      resp_risk: 'No backup immutability; backups vulnerable to ransomware.' }); count++
    await addStandard('onprem_backup', { name: 'Backup encryption enabled (at rest and in transit)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 6,
      resp_sat: 'Backup encryption enabled at rest and in transit.',
      resp_ar: 'Encryption enabled for one of rest/transit; other being configured.',
      resp_na: 'Encryption partially configured.',
      resp_risk: 'No backup encryption; data at risk.' }); count++
    await addStandard('onprem_backup', { name: 'Backup access secured with MFA', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 7,
      resp_sat: 'Backup console access requires MFA.',
      resp_ar: 'MFA enabled on primary access; secondary paths being secured.',
      resp_na: 'MFA not consistently enforced on backup systems.',
      resp_risk: 'Backup systems accessible without MFA.' }); count++

    // M365 / Cloud Backup
    await addStandard('cloud_backup', { name: 'M365 cloud backup active (Datto SaaS Protection)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'M365 backup active and protecting all licensed users.',
      resp_ar: 'M365 backup active; user coverage being verified.',
      resp_na: 'M365 backup partially deployed.',
      resp_risk: 'No M365 backup; relying on native Microsoft retention only.' }); count++
    await addStandard('cloud_backup', { name: 'M365 backup covers Exchange, OneDrive, SharePoint, Teams', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All four workloads covered by backup.',
      resp_ar: 'Three workloads covered; fourth being added.',
      resp_na: 'Only one or two workloads covered.',
      resp_risk: 'No workload coverage or backup not configured.' }); count++
    await addStandard('cloud_backup', { name: 'M365 backup retention meets client requirements', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Retention policies configured per client requirements and documented.',
      resp_ar: 'Default retention in place; client-specific review pending.',
      resp_na: 'Retention not reviewed against client requirements.',
      resp_risk: 'No retention policy configured or significantly inadequate.' }); count++

    // Recovery Testing & DR
    await addStandard('recovery_dr', { name: 'Backup test restore performed quarterly (minimum)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Quarterly test restores performed with documented results.',
      resp_ar: 'Semi-annual test restores performed.',
      resp_na: 'Test restores performed annually or ad-hoc.',
      resp_risk: 'No backup test restores performed.' }); count++
    await addStandard('recovery_dr', { name: 'RTO/RPO defined and documented per client', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'RTO/RPO defined, documented, and validated against backup configuration.',
      resp_ar: 'RTO/RPO defined; validation pending.',
      resp_na: 'RTO/RPO discussed but not formally documented.',
      resp_risk: 'No RTO/RPO defined; recovery expectations undefined.' }); count++
    await addStandard('recovery_dr', { name: 'Disaster recovery plan documented', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'DR plan documented, distributed, and includes contact tree.',
      resp_ar: 'DR plan exists but needs update.',
      resp_na: 'DR plan in draft or incomplete.',
      resp_risk: 'No disaster recovery plan exists.' }); count++
    await addStandard('recovery_dr', { name: 'DR plan reviewed/tested annually', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 4,
      resp_sat: 'DR plan tested annually with documented results and lessons learned.',
      resp_ar: 'DR plan reviewed annually; test planned.',
      resp_na: 'DR plan exists but not reviewed or tested.',
      resp_risk: 'No DR plan review or testing.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 6: Cloud & Applications (12 standards)
    // ────────────────────────────────────────────────────────────

    // M365 Administration
    await addStandard('m365_admin', { name: 'M365 global admin accounts limited to ≤2 and MFA-protected', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Global admin limited to ≤2 accounts with MFA and break-glass documented.',
      resp_ar: 'Global admin accounts slightly above 2; reduction planned.',
      resp_na: 'Multiple global admin accounts without controls.',
      resp_risk: 'Excessive global admin accounts without MFA.' }); count++
    await addStandard('m365_admin', { name: 'M365 admin audit logging enabled', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Unified audit logging enabled and forwarding to SIEM.',
      resp_ar: 'Audit logging enabled; SIEM integration pending.',
      resp_na: 'Audit logging partially configured.',
      resp_risk: 'Audit logging not enabled.' }); count++
    await addStandard('m365_admin', { name: 'M365 licensing reviewed and optimized annually', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Licensing reviewed annually with optimization documented.',
      resp_ar: 'Licensing reviewed but optimization opportunities exist.',
      resp_na: 'Licensing not reviewed recently.',
      resp_risk: 'Licensing never reviewed; potential waste or underprovisioning.' }); count++
    await addStandard('m365_admin', { name: 'M365 tenant security defaults or conditional access enabled', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Conditional access policies configured and enforced.',
      resp_ar: 'Security defaults enabled; conditional access migration planned.',
      resp_na: 'Neither security defaults nor conditional access enabled.',
      resp_risk: 'All security baselines disabled.' }); count++

    // SaaS Governance
    await addStandard('saas_gov', { name: 'SaaS monitoring active (SaaS Alerts)', priority: 'high', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'SaaS Alerts active with policies and alerting configured.',
      resp_ar: 'SaaS Alerts deployed; policy tuning in progress.',
      resp_na: 'SaaS monitoring partially deployed.',
      resp_risk: 'No SaaS monitoring in place.' }); count++
    await addStandard('saas_gov', { name: 'SaaS Alerts policies configured for anomaly detection', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Anomaly detection policies configured and tuned.',
      resp_ar: 'Default policies active; customization pending.',
      resp_na: 'Policies not configured beyond defaults.',
      resp_risk: 'No anomaly detection configured.' }); count++
    await addStandard('saas_gov', { name: 'Shadow IT / unauthorized SaaS usage monitored', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 3,
      resp_sat: 'Shadow IT detection active with review process.',
      resp_ar: 'Monitoring in place; review process being formalized.',
      resp_na: 'Partial monitoring; no formal review process.',
      resp_risk: 'No shadow IT monitoring.' }); count++
    await addStandard('saas_gov', { name: 'AI tool usage governed (approved tools only, no data leakage)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'AI governance policy in place with approved tool list.',
      resp_ar: 'AI policy drafted; enforcement in progress.',
      resp_na: 'No formal AI governance policy.',
      resp_risk: 'AI tools used without any governance or data protection.' }); count++

    // Application Management
    await addStandard('app_mgmt', { name: 'All installed software is vendor-supported (not EOL)', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'All software within vendor support lifecycle.',
      resp_ar: 'Minor EOL software identified with replacement plan.',
      resp_na: 'Multiple EOL applications in use.',
      resp_risk: 'Significant unsupported software across the environment.' }); count++
    await addStandard('app_mgmt', { name: 'Software inventory maintained and reviewed annually', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Software inventory current and reviewed annually.',
      resp_ar: 'Inventory exists; annual review pending.',
      resp_na: 'Inventory incomplete or outdated.',
      resp_risk: 'No software inventory maintained.' }); count++
    await addStandard('app_mgmt', { name: 'Unauthorized software removal process documented', priority: 'low', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Unauthorized software process documented and enforced.',
      resp_ar: 'Process exists; enforcement being improved.',
      resp_na: 'Process discussed but not documented.',
      resp_risk: 'No process for unauthorized software.' }); count++
    await addStandard('app_mgmt', { name: 'Password manager deployed (IT Glue MyGlue / Keeper)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Password manager deployed to all users with adoption tracking.',
      resp_ar: 'Password manager deployed; adoption in progress.',
      resp_na: 'Password manager available but low adoption.',
      resp_risk: 'No password manager deployed.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 7: Documentation & Operations (10 standards)
    // ────────────────────────────────────────────────────────────

    // IT Glue Documentation
    await addStandard('itglue', { name: 'IT Glue organization active and populated', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'IT Glue org active with all standard documentation types populated.',
      resp_ar: 'IT Glue active; some documentation sections need update.',
      resp_na: 'IT Glue partially populated.',
      resp_risk: 'IT Glue not active or significantly empty.' }); count++
    await addStandard('itglue', { name: 'Network documentation current (passwords, configs, IPs)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Network passwords, configs, and IP schemes current in IT Glue.',
      resp_ar: 'Most documentation current; minor updates needed.',
      resp_na: 'Documentation significantly outdated.',
      resp_risk: 'No network documentation or stored outside IT Glue.' }); count++
    await addStandard('itglue', { name: 'Contact/user list current and synced', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Contact list synced from AD/Entra and reviewed quarterly.',
      resp_ar: 'Contact list mostly current.',
      resp_na: 'Contact list outdated or not synced.',
      resp_risk: 'No maintained contact list.' }); count++
    await addStandard('itglue', { name: 'Key procedures documented (onboarding, offboarding, DR)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'All key procedures documented and accessible.',
      resp_ar: 'Most key procedures documented.',
      resp_na: 'Some procedures documented; gaps exist.',
      resp_risk: 'No standard procedures documented.' }); count++
    await addStandard('itglue', { name: 'Asset inventory current and synced with RMM/PSA', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 5,
      resp_sat: 'Asset inventory auto-synced and reconciled regularly.',
      resp_ar: 'Assets mostly synced; minor discrepancies.',
      resp_na: 'Asset inventory incomplete or not synced.',
      resp_risk: 'No centralized asset inventory.' }); count++

    // PSA & Service Management
    await addStandard('psa', { name: 'Autotask company record accurate (contacts, site info)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'AT company record complete and accurate.',
      resp_ar: 'Record mostly accurate; minor fields need update.',
      resp_na: 'Record has significant gaps.',
      resp_risk: 'AT company record incomplete or inaccurate.' }); count++
    await addStandard('psa', { name: 'Ticket taxonomy aligned to v4 standard (issue/sub-issue)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All tickets categorized per v4 taxonomy standard.',
      resp_ar: 'Taxonomy aligned; minor legacy categories being migrated.',
      resp_na: 'Taxonomy partially aligned.',
      resp_risk: 'Taxonomy not aligned to standard.' }); count++
    await addStandard('psa', { name: 'All managed assets tracked in Autotask with warranty dates', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 3,
      resp_sat: 'All managed assets in AT with warranty/EOL dates.',
      resp_ar: 'Most assets tracked; warranty dates being populated.',
      resp_na: 'Assets partially tracked.',
      resp_risk: 'No asset tracking in AT.' }); count++

    // Lifecycle Management
    await addStandard('lifecycle_mgmt', { name: 'ScalePad Lifecycle Manager active with current data', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'ScalePad active and synced with current warranty/EOL data.',
      resp_ar: 'ScalePad active; data reconciliation in progress.',
      resp_na: 'ScalePad deployed but data stale.',
      resp_risk: 'No lifecycle management tool active.' }); count++
    await addStandard('lifecycle_mgmt', { name: 'Hardware lifecycle plan documented and reviewed quarterly', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Lifecycle plan documented, funded, and reviewed quarterly.',
      resp_ar: 'Lifecycle plan exists; review cadence being established.',
      resp_na: 'Lifecycle plan incomplete or not reviewed.',
      resp_risk: 'No hardware lifecycle plan.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 8: Physical & Environmental (6 standards)
    // ────────────────────────────────────────────────────────────

    await addStandard('server_room', { name: 'Server/network equipment in dedicated, locked space', priority: 'high', tier: 'level_1', delivery: 'onsite_required', sort: 1,
      resp_sat: 'Equipment in a dedicated, locked room with controlled access.',
      resp_ar: 'Equipment in a locked space; access controls need improvement.',
      resp_na: 'Equipment in a shared space with limited physical security.',
      resp_risk: 'Equipment in an unsecured, accessible location.' }); count++
    await addStandard('server_room', { name: 'Server room/closet has adequate cooling', priority: 'medium', tier: 'level_1', delivery: 'onsite_required', sort: 2,
      resp_sat: 'Dedicated cooling with temperature monitoring.',
      resp_ar: 'Adequate cooling; monitoring being added.',
      resp_na: 'Cooling present but insufficient or unreliable.',
      resp_risk: 'No dedicated cooling; heat-related failures likely.' }); count++
    await addStandard('server_room', { name: 'UPS installed with adequate capacity for graceful shutdown', priority: 'medium', tier: 'level_1', delivery: 'onsite_required', sort: 3,
      resp_sat: 'UPS installed with capacity for 15+ minute runtime and auto-shutdown.',
      resp_ar: 'UPS installed; capacity or auto-shutdown needs verification.',
      resp_na: 'UPS installed but undersized or not configured for auto-shutdown.',
      resp_risk: 'No UPS installed; equipment unprotected from power events.' }); count++

    await addStandard('physical_security', { name: 'Physical access to IT equipment restricted to authorized personnel', priority: 'high', tier: 'level_1', delivery: 'onsite_required', sort: 1,
      resp_sat: 'Access controlled with key/badge and access log maintained.',
      resp_ar: 'Access restricted; logging needs improvement.',
      resp_na: 'Access somewhat restricted but not formally controlled.',
      resp_risk: 'Anyone can access IT equipment; no controls.' }); count++
    await addStandard('physical_security', { name: 'Structured cabling meets Cat 5e+ standard, documented and labeled', priority: 'low', tier: 'level_1', delivery: 'onsite_required', sort: 2,
      resp_sat: 'Cat 5e+ cabling with patch panels, labeled and documented.',
      resp_ar: 'Cabling meets standard; labeling needs update.',
      resp_na: 'Cabling mix; some below standard or unlabeled.',
      resp_risk: 'Disorganized cabling below standard.' }); count++
    await addStandard('physical_security', { name: 'UPS battery within warranty / replacement lifecycle', priority: 'medium', tier: 'level_1', delivery: 'onsite_required', sort: 3,
      resp_sat: 'UPS batteries within lifecycle with replacement schedule.',
      resp_ar: 'Batteries current; replacement schedule being documented.',
      resp_na: 'Batteries age unknown or approaching end of life.',
      resp_risk: 'Batteries expired or UPS not functioning.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 9: Compliance & Policy (10 standards)
    // ────────────────────────────────────────────────────────────

    // Core Policies
    await addStandard('core_policies', { name: 'Acceptable Use Policy published and acknowledged by all staff', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'AUP published, acknowledged annually by all staff, documented.',
      resp_ar: 'AUP published; acknowledgment tracking needs improvement.',
      resp_na: 'AUP exists but not published or acknowledged.',
      resp_risk: 'No Acceptable Use Policy.' }); count++
    await addStandard('core_policies', { name: 'Information Security Policy documented and reviewed annually', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'InfoSec policy documented, reviewed annually, signed by leadership.',
      resp_ar: 'Policy exists; annual review pending.',
      resp_na: 'Policy in draft or outdated.',
      resp_risk: 'No Information Security Policy.' }); count++
    await addStandard('core_policies', { name: 'Data classification and handling policy documented', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 3,
      resp_sat: 'Data classification policy documented with handling procedures.',
      resp_ar: 'Policy drafted; implementation pending.',
      resp_na: 'Data handling practices informal; no policy.',
      resp_risk: 'No data classification or handling guidance.' }); count++
    await addStandard('core_policies', { name: 'Remote work / work-from-home security policy documented', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Remote work security policy documented and communicated.',
      resp_ar: 'Policy drafted; communication pending.',
      resp_na: 'No formal remote work security policy.',
      resp_risk: 'Remote work with no security guidelines.' }); count++

    // Insurance & Legal
    await addStandard('insurance', { name: 'Cyber liability insurance active', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Cyber insurance active with adequate coverage reviewed annually.',
      resp_ar: 'Cyber insurance active; coverage adequacy review pending.',
      resp_na: 'Cyber insurance under consideration; not yet purchased.',
      resp_risk: 'No cyber liability insurance.' }); count++
    await addStandard('insurance', { name: 'Cyber insurance coverage reviewed annually', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Coverage reviewed annually against current risk profile.',
      resp_ar: 'Coverage exists; annual review process being established.',
      resp_na: 'Coverage not reviewed since purchase.',
      resp_risk: 'Coverage unknown or potentially inadequate.' }); count++

    // Compliance Readiness
    await addStandard('compliance_readiness', { name: 'Compliance requirements identified per client vertical', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Compliance requirements identified, documented, and mapped to standards.',
      resp_ar: 'Requirements identified; mapping in progress.',
      resp_na: 'Requirements partially identified.',
      resp_risk: 'No compliance requirement identification performed.' }); count++
    await addStandard('compliance_readiness', { name: 'Compliance evidence collection process documented', priority: 'medium', tier: 'level_2', delivery: 'remote_human', sort: 2,
      resp_sat: 'Evidence collection process documented and followed.',
      resp_ar: 'Process exists informally; documentation pending.',
      resp_na: 'Evidence collected ad-hoc; no process.',
      resp_risk: 'No evidence collection process.' }); count++
    await addStandard('compliance_readiness', { name: 'Employee security training records maintained', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Training records maintained and readily available for audit.',
      resp_ar: 'Records maintained; organization needs improvement.',
      resp_na: 'Records incomplete or scattered.',
      resp_risk: 'No training records maintained.' }); count++
    await addStandard('compliance_readiness', { name: 'BYOD policy documented (or explicitly prohibited)', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'BYOD policy documented with clear security requirements or explicit prohibition.',
      resp_ar: 'BYOD policy in draft.',
      resp_na: 'BYOD happening without policy.',
      resp_risk: 'No BYOD policy and personal devices accessing company data.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 10: Business Alignment & Governance (8 standards)
    // ────────────────────────────────────────────────────────────

    // Strategic Engagement
    await addStandard('strategic', { name: 'Quarterly business review (QBR/vCIO review) conducted', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'QBRs conducted on schedule with documented outcomes.',
      resp_ar: 'QBRs conducted with minor scheduling gaps.',
      resp_na: 'QBRs inconsistent or infrequent.',
      resp_risk: 'No QBRs or regular business reviews.' }); count++
    await addStandard('strategic', { name: 'Technology roadmap maintained and reviewed quarterly', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Roadmap maintained in Align and reviewed quarterly with client.',
      resp_ar: 'Roadmap exists; review cadence being established.',
      resp_na: 'Roadmap incomplete or outdated.',
      resp_risk: 'No technology roadmap for this client.' }); count++
    await addStandard('strategic', { name: 'IT budget reviewed and planned annually', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Annual IT budget planned and aligned to roadmap.',
      resp_ar: 'Budget discussed; formal planning pending.',
      resp_na: 'Budget not formally planned.',
      resp_risk: 'No IT budget discussion or planning.' }); count++
    await addStandard('strategic', { name: 'Executive sponsor / IT decision maker identified and engaged', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Executive sponsor identified and actively engaged.',
      resp_ar: 'Decision maker identified; engagement improving.',
      resp_na: 'Decision maker identified but not engaged.',
      resp_risk: 'No identified IT decision maker or sponsor.' }); count++

    // Service Governance
    await addStandard('service_gov', { name: 'Client satisfaction (CSAT) measured and reviewed', priority: 'medium', tier: 'level_1', delivery: 'automated', sort: 1,
      resp_sat: 'CSAT actively measured with review and action on feedback.',
      resp_ar: 'CSAT measured; review process being formalized.',
      resp_na: 'CSAT measured but not reviewed.',
      resp_risk: 'No CSAT measurement.' }); count++
    await addStandard('service_gov', { name: 'Open recommendations reviewed at each QBR', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'Open recommendations reviewed at every QBR with status updates.',
      resp_ar: 'Recommendations reviewed at most QBRs.',
      resp_na: 'Recommendations reviewed inconsistently.',
      resp_risk: 'Recommendations not tracked or reviewed.' }); count++
    await addStandard('service_gov', { name: 'Ticket trends reviewed monthly for recurring issues', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Monthly ticket trend review with pattern identification and action.',
      resp_ar: 'Ticket trends reviewed periodically.',
      resp_na: 'Ticket trends not regularly reviewed.',
      resp_risk: 'No ticket trend analysis.' }); count++
    await addStandard('service_gov', { name: 'Client emergency contacts and escalation path documented', priority: 'medium', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Emergency contacts and escalation path documented and current.',
      resp_ar: 'Contacts documented; escalation path needs update.',
      resp_na: 'Contacts partially documented.',
      resp_risk: 'No emergency contacts or escalation path documented.' }); count++

    // ────────────────────────────────────────────────────────────
    // Domain 11: Remote Work & Access (4 standards)
    // ────────────────────────────────────────────────────────────

    await addStandard('remote_access', { name: 'Remote access via managed endpoints only (no personal devices for company data)', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 1,
      resp_sat: 'Company data only accessible from managed, enrolled devices.',
      resp_ar: 'Mostly managed devices; minor exceptions documented.',
      resp_na: 'Personal devices accessing company data without controls.',
      resp_risk: 'No device management; personal devices widely used.' }); count++
    await addStandard('remote_access', { name: 'Remote access secured with MFA', priority: 'high', tier: 'level_1', delivery: 'remote_human', sort: 2,
      resp_sat: 'All remote access paths require MFA.',
      resp_ar: 'Primary remote access secured; secondary paths being addressed.',
      resp_na: 'MFA not consistently enforced on remote access.',
      resp_risk: 'Remote access available without MFA.' }); count++
    await addStandard('remote_access', { name: 'Remote work connectivity standards met (100/100+, wired preferred)', priority: 'low', tier: 'level_1', delivery: 'remote_human', sort: 3,
      resp_sat: 'Connectivity standards documented and met by remote workers.',
      resp_ar: 'Standards documented; compliance verification in progress.',
      resp_na: 'No connectivity standards defined.',
      resp_risk: 'Remote workers on inadequate connections affecting productivity.' }); count++
    await addStandard('remote_access', { name: 'Home network security requirements communicated (WPA2/WPA3)', priority: 'low', tier: 'level_1', delivery: 'remote_human', sort: 4,
      resp_sat: 'Home network security guide published and acknowledged by remote staff.',
      resp_ar: 'Security guide exists; distribution pending.',
      resp_na: 'No home network security guidance provided.',
      resp_risk: 'Remote workers on unsecured home networks with no guidance.' }); count++

    await client.query('COMMIT')
    console.log(`\nSeed complete: ${count} standards created with ${count * 5} responses`)
    console.log(`Domains: ${domains.length}, Categories: ${categories.length}`)

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed FAILED:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
