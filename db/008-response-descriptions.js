/**
 * Migration 008 — Add response descriptions to existing template items
 *
 * Updates template_item_responses.description for all existing seeded templates
 * based on item title + response label matching.
 *
 * Run: node db/008-response-descriptions.js
 */
require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool()

// [item_title, response_label, description]
const UPDATES = [
  // ─── LCI_TEMPLATE: Infrastructure & Hosting ─────────────────────────────────
  ['Infrastructure hosting model', 'Satisfactory', 'Primarily cloud-hosted or professional colocation with proper redundancy'],
  ['Infrastructure hosting model', 'Needs Attention', 'Mix of self-hosted and some cloud services, inconsistent approach'],
  ['Infrastructure hosting model', 'At Risk', 'Entirely self-hosted in office/closet with no redundancy'],
  ['Infrastructure hosting model', 'Not Applicable', 'No servers or infrastructure'],

  ['Virtualization platform and architecture', 'Satisfactory', 'Modern hypervisor platform (Hyper-V, VMware, or cloud-native) in use'],
  ['Virtualization platform and architecture', 'Needs Attention', 'Mix of physical and virtual, inconsistent virtualization strategy'],
  ['Virtualization platform and architecture', 'At Risk', 'Primarily physical servers or aging virtualization platform'],
  ['Virtualization platform and architecture', 'Not Applicable', 'No on-premises servers requiring virtualization'],

  ['Server hardware age and support status', 'Satisfactory', 'All servers within 5-year lifecycle and under active vendor support'],
  ['Server hardware age and support status', 'Needs Attention', 'Some servers approaching end of life (3–5 years), support contracts lapsing'],
  ['Server hardware age and support status', 'At Risk', 'One or more servers beyond 5 years old or on unsupported hardware'],
  ['Server hardware age and support status', 'Not Applicable', 'No on-premises server hardware'],

  ['Operating system versions and support status', 'Satisfactory', 'All servers and endpoints on current, vendor-supported OS versions'],
  ['Operating system versions and support status', 'Needs Attention', 'Some systems on older but still supported OS versions, upgrade planned'],
  ['Operating system versions and support status', 'At Risk', 'One or more systems on end-of-life operating systems (e.g. Windows Server 2012, Windows 10)'],
  ['Operating system versions and support status', 'Not Applicable', 'No managed operating systems in scope'],

  ['Power protection and environmental controls', 'Satisfactory', 'UPS with adequate runtime, temperature monitoring, and alerting in place'],
  ['Power protection and environmental controls', 'Needs Attention', 'UPS in place but undersized or lacking monitoring; environmental controls incomplete'],
  ['Power protection and environmental controls', 'At Risk', 'No UPS or environmental controls; equipment at risk from power events or overheating'],
  ['Power protection and environmental controls', 'Not Applicable', 'No on-premises equipment requiring power protection'],

  ['Internet connectivity and redundancy', 'Satisfactory', 'Primary and secondary ISP with automatic failover configured'],
  ['Internet connectivity and redundancy', 'Needs Attention', 'Single ISP with no automatic failover; secondary connection being considered'],
  ['Internet connectivity and redundancy', 'At Risk', 'Single ISP connection with no redundancy; business-critical operations at risk of outage'],
  ['Internet connectivity and redundancy', 'Not Applicable', 'Client operates fully in-cloud or has no business-critical connectivity dependency'],

  // ─── LCI_TEMPLATE: Network & Security ───────────────────────────────────────
  ['Network segmentation and VLAN strategy', 'Satisfactory', 'VLANs implemented — production, guest, IoT, and management traffic separated'],
  ['Network segmentation and VLAN strategy', 'Needs Attention', 'Partial segmentation in place; some traffic mixing between production and guest/IoT'],
  ['Network segmentation and VLAN strategy', 'At Risk', 'Flat network — all devices share the same broadcast domain with no segmentation'],
  ['Network segmentation and VLAN strategy', 'Not Applicable', 'Network scope too small to require formal segmentation'],

  ['Wireless network security and guest access', 'Satisfactory', 'Corporate and guest Wi-Fi are isolated VLANs; WPA2-Enterprise or WPA3 in use'],
  ['Wireless network security and guest access', 'Needs Attention', 'Guest Wi-Fi present but not fully isolated; corporate uses WPA2-PSK only'],
  ['Wireless network security and guest access', 'At Risk', 'No guest network separation; guests can reach internal resources via wireless'],
  ['Wireless network security and guest access', 'Not Applicable', 'No wireless networking in use'],

  ['Firewall and unified threat management', 'Satisfactory', 'Business-grade NGFW with IPS, content filtering, and active support subscription'],
  ['Firewall and unified threat management', 'Needs Attention', 'Business firewall in place but security subscriptions lapsed or features disabled'],
  ['Firewall and unified threat management', 'At Risk', 'Consumer-grade firewall, EOL hardware, or no active threat management features'],
  ['Firewall and unified threat management', 'Not Applicable', 'Client operates fully in cloud with no on-premises perimeter'],

  ['VPN and remote access security', 'Satisfactory', 'MFA enforced on all VPN and remote access; modern protocol (ZTNA or SSL VPN)'],
  ['VPN and remote access security', 'Needs Attention', 'VPN in place but MFA not enforced; some users using insecure remote access methods'],
  ['VPN and remote access security', 'At Risk', 'RDP exposed to internet, no MFA on remote access, or insecure VPN protocol in use'],
  ['VPN and remote access security', 'Not Applicable', 'No remote access required for this client'],

  ['DNS security and content filtering', 'Satisfactory', 'DNS filtering deployed on all endpoints and networks including roaming users'],
  ['DNS security and content filtering', 'Needs Attention', 'DNS filtering on-premises only; roaming users or some segments not covered'],
  ['DNS security and content filtering', 'At Risk', 'No DNS filtering in place; malicious domains are not blocked at the DNS layer'],
  ['DNS security and content filtering', 'Not Applicable', 'Client has an equivalent control through another mechanism'],

  ['Network monitoring and alerting', 'Satisfactory', 'Active monitoring with alerting on device outages, utilization, and anomalies'],
  ['Network monitoring and alerting', 'Needs Attention', 'Basic monitoring in place but alerting is incomplete or inconsistently reviewed'],
  ['Network monitoring and alerting', 'At Risk', 'No formal network monitoring; issues discovered reactively after impact'],
  ['Network monitoring and alerting', 'Not Applicable', 'Network scope managed entirely by a third party with SLA-backed monitoring'],

  // ─── LCI_TEMPLATE: Endpoint Protection ──────────────────────────────────────
  ['Antivirus and endpoint detection & response (EDR)', 'Satisfactory', 'Next-gen EDR deployed to 100% of managed endpoints with active monitoring'],
  ['Antivirus and endpoint detection & response (EDR)', 'Needs Attention', 'EDR deployed but coverage is incomplete; some endpoints running legacy AV only'],
  ['Antivirus and endpoint detection & response (EDR)', 'At Risk', 'No EDR deployed; legacy AV only or no endpoint protection on critical systems'],
  ['Antivirus and endpoint detection & response (EDR)', 'Not Applicable', 'No managed endpoints in scope'],

  ['Device encryption and data protection', 'Satisfactory', 'Full disk encryption enabled on all laptops; recovery keys centrally managed'],
  ['Device encryption and data protection', 'Needs Attention', 'Encryption deployed on most devices; some laptops or portable media unencrypted'],
  ['Device encryption and data protection', 'At Risk', 'No encryption on portable devices; sensitive data at high risk if hardware is lost or stolen'],
  ['Device encryption and data protection', 'Not Applicable', 'No portable devices; all endpoints are fixed workstations in a secure facility'],

  ['Patch management and update process', 'Satisfactory', 'Automated patching achieving 95%+ compliance within 30 days of release'],
  ['Patch management and update process', 'Needs Attention', 'Patch management process in place but compliance below 90%; some systems delayed'],
  ['Patch management and update process', 'At Risk', 'No automated patching; systems significantly behind on critical security updates'],
  ['Patch management and update process', 'Not Applicable', 'Patch management handled directly by the client under a documented process'],

  ['Application control and software restrictions', 'Satisfactory', 'Application whitelisting or controlled folder access preventing unauthorized software'],
  ['Application control and software restrictions', 'Needs Attention', 'Basic software restriction policies in place but not comprehensive; gaps exist'],
  ['Application control and software restrictions', 'At Risk', 'No application control; users can install any software without restriction'],
  ['Application control and software restrictions', 'Not Applicable', 'Client environment does not require application control based on risk profile'],

  // ─── LCI_TEMPLATE: Identity & Access Management ─────────────────────────────
  ['Multi-factor authentication coverage', 'Satisfactory', 'MFA enforced on all users for all cloud services, VPN, and admin portals'],
  ['Multi-factor authentication coverage', 'Needs Attention', 'MFA enabled for most users but some accounts or services remain password-only'],
  ['Multi-factor authentication coverage', 'At Risk', 'MFA not enforced; most or all access secured by password only'],
  ['Multi-factor authentication coverage', 'Not Applicable', 'Client has no cloud services or remote access requiring MFA'],

  ['Privileged access management', 'Satisfactory', 'Dedicated admin accounts used; least-privilege enforced; shared credentials eliminated'],
  ['Privileged access management', 'Needs Attention', 'Admin accounts partially separated; some shared credentials or over-privileged accounts remain'],
  ['Privileged access management', 'At Risk', 'No PAM practices; admin access shared, undocumented, or using personal accounts'],
  ['Privileged access management', 'Not Applicable', 'Client scope does not include systems requiring elevated access management'],

  ['User offboarding and access revocation', 'Satisfactory', 'Formal offboarding checklist; all access revoked within 24 hours of departure'],
  ['User offboarding and access revocation', 'Needs Attention', 'Offboarding process exists but not consistently followed; some stale accounts found'],
  ['User offboarding and access revocation', 'At Risk', 'No formal offboarding; departed employees may retain active accounts and access'],
  ['User offboarding and access revocation', 'Not Applicable', 'Client has no employee turnover risk or a fully managed HR-IT integration process'],

  ['Password policy and credential hygiene', 'Satisfactory', 'Strong password policy enforced (14+ chars, no reuse) and password manager in use'],
  ['Password policy and credential hygiene', 'Needs Attention', 'Password policy in place but not fully enforced; no password manager deployed'],
  ['Password policy and credential hygiene', 'At Risk', 'Weak or no password policy; passwords reused, shared, or stored insecurely'],
  ['Password policy and credential hygiene', 'Not Applicable', 'Single sign-on with MFA covers all access; traditional passwords not used'],

  // ─── LCI_TEMPLATE: Backup & Disaster Recovery ───────────────────────────────
  ['Server and VM backup coverage', 'Satisfactory', 'All servers and VMs in backup jobs; daily completion verified and alerted'],
  ['Server and VM backup coverage', 'Needs Attention', 'Most servers covered but some gaps in backup jobs or inconsistent job completion'],
  ['Server and VM backup coverage', 'At Risk', 'Backup coverage is incomplete or backups are failing without detection'],
  ['Server and VM backup coverage', 'Not Applicable', 'No on-premises servers or VMs in scope'],

  ['Cloud and SaaS data backup', 'Satisfactory', 'M365, Google Workspace, and key SaaS platforms backed up by a third-party solution'],
  ['Cloud and SaaS data backup', 'Needs Attention', 'Some SaaS platforms backed up but coverage is incomplete (e.g. SharePoint not included)'],
  ['Cloud and SaaS data backup', 'At Risk', 'No third-party backup for cloud data; relying solely on vendor retention policies'],
  ['Cloud and SaaS data backup', 'Not Applicable', 'Client does not use SaaS platforms containing business-critical data'],

  ['Backup immutability and ransomware protection', 'Satisfactory', 'Immutable (WORM) backups in place; backup storage is isolated from production'],
  ['Backup immutability and ransomware protection', 'Needs Attention', 'Backups exist but are not immutable; ransomware could potentially encrypt backup data'],
  ['Backup immutability and ransomware protection', 'At Risk', 'No backup immutability; backup targets accessible from production network'],
  ['Backup immutability and ransomware protection', 'Not Applicable', 'Backup strategy managed and guaranteed immutable by a third-party provider'],

  ['Recovery testing cadence', 'Satisfactory', 'Restore tests conducted quarterly with documented RTO/RPO validation'],
  ['Recovery testing cadence', 'Needs Attention', 'Restore tests performed but irregularly; documentation of results incomplete'],
  ['Recovery testing cadence', 'At Risk', 'Backups have never been tested or testing is more than 12 months overdue'],
  ['Recovery testing cadence', 'Not Applicable', 'Recovery testing performed and documented by a managed backup provider'],

  ['Offsite and geographically separated backup copy', 'Satisfactory', 'At least one backup copy stored offsite or in a separate cloud region from primary'],
  ['Offsite and geographically separated backup copy', 'Needs Attention', 'Offsite backup in place but in the same geographic region as primary systems'],
  ['Offsite and geographically separated backup copy', 'At Risk', 'All backups co-located with primary systems; a site disaster would destroy both'],
  ['Offsite and geographically separated backup copy', 'Not Applicable', 'Backup architecture already inherently geographically distributed'],

  // ─── LCI_TEMPLATE: Documentation & Processes ───────────────────────────────
  ['Network and infrastructure documentation', 'Satisfactory', 'Current network diagrams, IP addressing, and hardware inventory in documentation platform'],
  ['Network and infrastructure documentation', 'Needs Attention', 'Documentation exists but is outdated or incomplete; diagrams not current'],
  ['Network and infrastructure documentation', 'At Risk', 'No formal documentation; network and infrastructure knowledge is undocumented'],
  ['Network and infrastructure documentation', 'Not Applicable', 'Client environment is too small to require formal infrastructure documentation'],

  ['Credentials and password management', 'Satisfactory', 'All credentials stored in a secure password manager (IT Glue, 1Password Teams); no spreadsheets'],
  ['Credentials and password management', 'Needs Attention', 'Password manager in place but not fully adopted; some credentials stored outside it'],
  ['Credentials and password management', 'At Risk', 'Credentials stored in spreadsheets, email, or shared documents with no access control'],
  ['Credentials and password management', 'Not Applicable', 'Single sign-on manages all access; no shared credentials in scope'],

  ['Change management and approval process', 'Satisfactory', 'Formal change management process with documented approvals for all infrastructure changes'],
  ['Change management and approval process', 'Needs Attention', 'Informal change management; major changes documented but minor changes often untracked'],
  ['Change management and approval process', 'At Risk', 'No change management; infrastructure changes made ad-hoc without documentation or approval'],
  ['Change management and approval process', 'Not Applicable', 'Client environment is in a managed service contract that handles change management'],

  ['Vendor and contract management', 'Satisfactory', 'Complete inventory of vendor contracts, renewal dates, and contacts maintained and current'],
  ['Vendor and contract management', 'Needs Attention', 'Most contracts documented but some missing or renewal dates not tracked'],
  ['Vendor and contract management', 'At Risk', 'No vendor contract inventory; renewal dates and terms are unknown or untracked'],
  ['Vendor and contract management', 'Not Applicable', 'Client manages vendor contracts directly; not in scope for MSP services'],

  // ─── MITP_TEMPLATE: Helpdesk & Remote Support (Yes/No) ──────────────────────
  ['Is there a documented ticketing process and escalation path?', 'Yes', 'Ticketing system in place with documented SLAs and escalation tiers'],
  ['Is there a documented ticketing process and escalation path?', 'No', 'No documented process; tickets handled informally without defined escalation'],
  ['Are SLA response and resolution times defined and communicated to the client?', 'Yes', 'SLAs defined, documented, and communicated to the client in writing'],
  ['Are SLA response and resolution times defined and communicated to the client?', 'No', 'No formal SLAs; response times are undefined or not communicated'],
  ['Is remote access tooling deployed to all managed endpoints?', 'Yes', 'RMM agent deployed to 100% of managed workstations and servers'],
  ['Is remote access tooling deployed to all managed endpoints?', 'No', 'RMM coverage is incomplete; some endpoints cannot be accessed remotely'],
  ['Are helpdesk hours and after-hours procedures documented?', 'Yes', 'Support hours and after-hours escalation process are clearly documented'],
  ['Are helpdesk hours and after-hours procedures documented?', 'No', 'No documented after-hours process; clients are uncertain how to get emergency support'],
  ['Is customer satisfaction tracked and reviewed regularly?', 'Yes', 'CSAT surveys sent after ticket closure and scores reviewed monthly'],
  ['Is customer satisfaction tracked and reviewed regularly?', 'No', 'No CSAT tracking; client satisfaction is not formally measured'],

  // ─── MITP_TEMPLATE: Server & Endpoint Management ────────────────────────────
  ['Are all servers on vendor-supported operating systems?', 'Yes', 'All servers running OS versions with active vendor security support'],
  ['Are all servers on vendor-supported operating systems?', 'No', 'One or more servers on end-of-support OS (e.g. Windows Server 2012 R2)'],
  ['Is patch management automated and verified monthly?', 'Yes', 'Automated patching configured via RMM; compliance reports reviewed monthly'],
  ['Is patch management automated and verified monthly?', 'No', 'Patching is manual or inconsistent; monthly verification not in place'],
  ['Are server backups tested and verified regularly?', 'Yes', 'Backup restore tests performed and documented; 3-2-1 strategy in place'],
  ['Are server backups tested and verified regularly?', 'No', 'Backups not regularly tested; restore capability unverified'],
  ['Is server hardware within lifecycle (under 5 years)?', 'Yes', 'All servers within 5-year hardware lifecycle'],
  ['Is server hardware within lifecycle (under 5 years)?', 'No', 'One or more servers exceed 5 years; hardware refresh planning needed'],
  ['Are all workstations on Windows 10 or later?', 'Yes', 'All workstations running Windows 10 or Windows 11'],
  ['Are all workstations on Windows 10 or later?', 'No', 'Windows 7 or Windows 8.x devices still in use'],
  ['Is disk health monitoring in place for all critical systems?', 'Yes', 'Disk health monitoring active; S.M.A.R.T. alerts configured on all critical systems'],
  ['Is disk health monitoring in place for all critical systems?', 'No', 'No disk health monitoring; failures may go undetected until data loss occurs'],

  // ─── MITP_TEMPLATE: Network Infrastructure ──────────────────────────────────
  ['Is network hardware (switches, routers, APs) on vendor-supported firmware?', 'Yes', 'All switches, routers, and APs on current supported firmware'],
  ['Is network hardware (switches, routers, APs) on vendor-supported firmware?', 'No', 'Some network devices running unsupported firmware or past EOL'],
  ['Is guest Wi-Fi isolated from the production network?', 'Yes', 'Guest Wi-Fi on dedicated VLAN with no access to internal resources'],
  ['Is guest Wi-Fi isolated from the production network?', 'No', 'Guest Wi-Fi shares production network or is not properly isolated'],
  ['Are network diagrams current and documented?', 'Yes', 'Network diagrams up to date and stored in documentation platform'],
  ['Are network diagrams current and documented?', 'No', 'No current network documentation; diagrams outdated or missing'],
  ['Is internet redundancy (failover connection) in place?', 'Yes', 'Secondary ISP connection with automatic failover configured'],
  ['Is internet redundancy (failover connection) in place?', 'No', 'Single ISP connection with no redundancy'],
  ['Is network monitoring and alerting configured?', 'Yes', 'Active SNMP or flow monitoring with alerting on critical events'],
  ['Is network monitoring and alerting configured?', 'No', 'No proactive network monitoring; issues discovered reactively'],

  // ─── MITP_TEMPLATE: Firewall & Security ─────────────────────────────────────
  ['Is a business-grade next-generation firewall (NGFW) in place?', 'Yes', 'NGFW (Fortinet, SonicWall, Palo Alto, etc.) deployed and managed'],
  ['Is a business-grade next-generation firewall (NGFW) in place?', 'No', 'Consumer-grade or EOL firewall in use'],
  ['Is administrative access to the firewall restricted to trusted IPs only?', 'Yes', 'Admin access restricted to internal IPs; default admin accounts disabled'],
  ['Is administrative access to the firewall restricted to trusted IPs only?', 'No', 'Firewall admin accessible from any IP or using default credentials'],
  ['Is the firewall under an active support/subscription contract?', 'Yes', 'Active support and security subscription contract in place'],
  ['Is the firewall under an active support/subscription contract?', 'No', 'Support/subscription expired; no access to threat intelligence or vendor support'],
  ['Is DNS filtering/security (e.g., Cisco Umbrella, DNSFilter) in place?', 'Yes', 'DNS filtering deployed and covering all devices including roaming'],
  ['Is DNS filtering/security (e.g., Cisco Umbrella, DNSFilter) in place?', 'No', 'No DNS filtering; malicious domains not blocked at DNS layer'],
  ['Is multi-factor authentication required for VPN and remote access?', 'Yes', 'MFA enforced on all VPN and remote access connections'],
  ['Is multi-factor authentication required for VPN and remote access?', 'No', 'Password-only VPN or remote access in use'],
  ['Are firewall rules reviewed and cleaned up annually?', 'Yes', 'Firewall rules reviewed annually; stale rules removed and documented'],
  ['Are firewall rules reviewed and cleaned up annually?', 'No', 'Firewall rules never reviewed; accumulated stale and overly-permissive rules'],
  ['Is intrusion prevention (IPS) enabled and monitored?', 'Yes', 'IPS enabled and alerts reviewed; signatures updated automatically'],
  ['Is intrusion prevention (IPS) enabled and monitored?', 'No', 'IPS disabled or not configured; network intrusion attempts go undetected'],

  // ─── MITP_TEMPLATE: Endpoint Protection ─────────────────────────────────────
  ['Is enterprise EDR (Endpoint Detection & Response) deployed to all devices?', 'Yes', 'Next-gen EDR (SentinelOne, CrowdStrike, Defender for Business) on 100% of endpoints'],
  ['Is enterprise EDR (Endpoint Detection & Response) deployed to all devices?', 'No', 'Legacy AV only, or EDR coverage incomplete across managed endpoints'],
  ['Is full-disk encryption (BitLocker/FileVault) enabled on all laptops?', 'Yes', 'BitLocker/FileVault enabled on all laptops; recovery keys escrowed'],
  ['Is full-disk encryption (BitLocker/FileVault) enabled on all laptops?', 'No', 'Laptops without disk encryption; data at risk if device is lost or stolen'],
  ['Are USB/removable media policies enforced?', 'Yes', 'Endpoint policy blocks or restricts unauthorized USB and removable media'],
  ['Are USB/removable media policies enforced?', 'No', 'No USB restrictions; removable media poses data theft and malware risk'],
  ['Is application whitelisting or controlled folder access enabled?', 'Yes', 'Application whitelisting or Controlled Folder Access active and enforced'],
  ['Is application whitelisting or controlled folder access enabled?', 'No', 'Users can run any application; no protection against unauthorized software'],

  // ─── MITP_TEMPLATE: Cloud & Microsoft 365 ───────────────────────────────────
  ['Is MFA enforced for all Microsoft 365 users?', 'Yes', 'MFA enforced via Conditional Access for all M365 users; legacy auth blocked'],
  ['Is MFA enforced for all Microsoft 365 users?', 'No', 'MFA not enforced for all M365 users; some accounts password-only'],
  ['Are Microsoft 365 licenses appropriate for the business needs?', 'Yes', 'License assignment reviewed; right-sized for current needs with no over/under provisioning'],
  ['Are Microsoft 365 licenses appropriate for the business needs?', 'No', 'License assignment not reviewed; potential over-payment or compliance risk'],
  ['Is email spam/phishing filtering beyond M365 defaults in place?', 'Yes', 'Third-party email security or Defender for Office P2 in place'],
  ['Is email spam/phishing filtering beyond M365 defaults in place?', 'No', 'Relying on default M365 spam filtering only; enhanced protection not deployed'],
  ['Are DMARC, DKIM, and SPF records properly configured?', 'Yes', 'SPF, DKIM, and DMARC records properly configured; DMARC set to reject/quarantine'],
  ['Are DMARC, DKIM, and SPF records properly configured?', 'No', 'Email authentication records missing or misconfigured; domain spoofing risk'],
  ['Is cloud data backed up (M365 mailboxes, SharePoint, OneDrive)?', 'Yes', 'M365 mailboxes, SharePoint, and OneDrive backed up by a third-party solution'],
  ['Is cloud data backed up (M365 mailboxes, SharePoint, OneDrive)?', 'No', 'No third-party M365 backup; data relies solely on Microsoft\'s retention policies'],

  // ─── MITP_TEMPLATE: Security Awareness & Compliance ─────────────────────────
  ['Is security awareness training conducted at least annually?', 'Yes', 'Annual security awareness training completed by all staff with documented completion'],
  ['Is security awareness training conducted at least annually?', 'No', 'No formal security awareness training program in place'],
  ['Are simulated phishing campaigns run regularly?', 'Yes', 'Phishing simulations run monthly or quarterly; click rates tracked and improving'],
  ['Are simulated phishing campaigns run regularly?', 'No', 'No phishing simulations; staff susceptibility to phishing attacks unknown'],
  ['Is dark web monitoring in place for company email domains?', 'Yes', 'Active dark web monitoring for company email domains with alerting'],
  ['Is dark web monitoring in place for company email domains?', 'No', 'No dark web monitoring; credential exposure may go undetected'],
  ['Is a written acceptable use policy (AUP) in place and signed by staff?', 'Yes', 'AUP documented, distributed to all staff, and signed on hire and annually'],
  ['Is a written acceptable use policy (AUP) in place and signed by staff?', 'No', 'No formal AUP; staff lack clear guidance on acceptable technology use'],

  // ─── MITP_TEMPLATE: Business Continuity & Disaster Recovery ─────────────────
  ['Is a Business Continuity Plan (BCP) documented and tested?', 'Yes', 'BCP documented with RTO/RPO targets; tested and updated annually'],
  ['Is a Business Continuity Plan (BCP) documented and tested?', 'No', 'No formal BCP; recovery procedures are ad-hoc and untested'],
  ['Are off-site or cloud backups in place for all critical data?', 'Yes', 'Off-site or cloud backup copies in place for all critical data'],
  ['Are off-site or cloud backups in place for all critical data?', 'No', 'No off-site backup; all copies co-located with primary systems'],
  ['Are backup restore tests performed and documented quarterly?', 'Yes', 'Restore tests performed quarterly with documented results and recovery time validation'],
  ['Are backup restore tests performed and documented quarterly?', 'No', 'Restore tests not performed or not documented; recovery capability unverified'],
  ['Is there a documented cybersecurity incident response plan?', 'Yes', 'Incident response plan documented, rehearsed, and includes legal/insurance contacts'],
  ['Is there a documented cybersecurity incident response plan?', 'No', 'No incident response plan; breach response would be ad-hoc and delayed'],
  ['Is cyber liability insurance in place?', 'Yes', 'Cyber liability insurance policy active with adequate coverage limits reviewed annually'],
  ['Is cyber liability insurance in place?', 'No', 'No cyber liability insurance; financial exposure to breach costs is uncovered'],
]

async function main() {
  const client = await pool.connect()
  try {
    console.log(`[migration-008] Updating response descriptions for ${UPDATES.length} entries...`)
    let updated = 0
    let skipped = 0

    await client.query('BEGIN')

    for (const [itemTitle, respLabel, description] of UPDATES) {
      const result = await client.query(
        `UPDATE template_item_responses r
         SET description = $1
         FROM template_items i
         WHERE r.item_id = i.id
           AND i.title = $2
           AND r.label = $3
           AND (r.description IS NULL OR r.description = '')`,
        [description, itemTitle, respLabel]
      )
      if (result.rowCount > 0) {
        updated += result.rowCount
      } else {
        skipped++
      }
    }

    await client.query('COMMIT')
    console.log(`[migration-008] Done — updated: ${updated}, skipped (already set): ${skipped}`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[migration-008] Failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
}

main()
