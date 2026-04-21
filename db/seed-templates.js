require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool()

const MITP_TEMPLATE = {
  name: 'Technology Alignment Assessment',
  description: 'Comprehensive MSP technology alignment review. Yes/No format — No indicates misalignment requiring attention.',
  is_default: true,
  sections: [
    {
      name: 'Helpdesk & Remote Support', weight: 8, sort_order: 0,
      items: [
        {
          title: 'Is there a documented ticketing process and escalation path?', weight: 20, sort_order: 0,
          remediation_tips: 'Implement a PSA ticketing system with defined SLAs and escalation tiers.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Ticketing system in place with documented SLAs and escalation tiers' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No documented process; tickets handled informally without defined escalation' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are SLA response and resolution times defined and communicated to the client?', weight: 20, sort_order: 1,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'SLAs defined, documented, and communicated to the client in writing' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No formal SLAs; response times are undefined or not communicated' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is remote access tooling deployed to all managed endpoints?', weight: 20, sort_order: 2,
          remediation_tips: 'Deploy RMM agent to all workstations and servers for consistent remote support capability.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'RMM agent deployed to 100% of managed workstations and servers' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'RMM coverage is incomplete; some endpoints cannot be accessed remotely' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are helpdesk hours and after-hours procedures documented?', weight: 20, sort_order: 3,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Support hours and after-hours escalation process are clearly documented' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No documented after-hours process; clients are uncertain how to get emergency support' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is customer satisfaction tracked and reviewed regularly?', weight: 20, sort_order: 4,
          remediation_tips: 'Implement CSAT surveys after ticket closure and review scores monthly.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'CSAT surveys sent after ticket closure and scores reviewed monthly' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No CSAT tracking; client satisfaction is not formally measured' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Server & Endpoint Management', weight: 14, sort_order: 1,
      items: [
        {
          title: 'Are all servers on vendor-supported operating systems?', weight: 17, sort_order: 0,
          remediation_tips: 'Identify end-of-support systems and plan upgrades. Windows Server 2012/R2 reached EOS in October 2023.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All servers running OS versions with active vendor security support' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'One or more servers on end-of-support OS (e.g. Windows Server 2012 R2)' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is patch management automated and verified monthly?', weight: 17, sort_order: 1,
          remediation_tips: 'Configure automated patching via RMM. Review patch compliance reports monthly.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Automated patching configured via RMM; compliance reports reviewed monthly' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Patching is manual or inconsistent; monthly verification not in place' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are server backups tested and verified regularly?', weight: 17, sort_order: 2,
          remediation_tips: 'Implement 3-2-1 backup strategy. Test restores quarterly and document results.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Backup restore tests performed and documented; 3-2-1 strategy in place' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Backups not regularly tested; restore capability unverified' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is server hardware within lifecycle (under 5 years)?', weight: 17, sort_order: 3,
          remediation_tips: 'Plan hardware refresh cycles. Aging hardware increases failure risk and support costs.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All servers within 5-year hardware lifecycle' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'One or more servers exceed 5 years; hardware refresh planning needed' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are all workstations on Windows 10 or later?', weight: 16, sort_order: 4,
          remediation_tips: 'Identify and replace or upgrade Windows 7/8 systems. Windows 10 EOL is October 2025.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All workstations running Windows 10 or Windows 11' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Windows 7 or Windows 8.x devices still in use' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is disk health monitoring in place for all critical systems?', weight: 16, sort_order: 5,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Disk health monitoring active; S.M.A.R.T. alerts configured on all critical systems' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No disk health monitoring; failures may go undetected until data loss occurs' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Network Infrastructure', weight: 14, sort_order: 2,
      items: [
        {
          title: 'Is network hardware (switches, routers, APs) on vendor-supported firmware?', weight: 20, sort_order: 0,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All switches, routers, and APs on current supported firmware' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Some network devices running unsupported firmware or past EOL' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is guest Wi-Fi isolated from the production network?', weight: 20, sort_order: 1,
          remediation_tips: 'Segment guest wireless on a separate VLAN with no access to internal resources.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Guest Wi-Fi on dedicated VLAN with no access to internal resources' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Guest Wi-Fi shares production network or is not properly isolated' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are network diagrams current and documented?', weight: 20, sort_order: 2,
          remediation_tips: 'Maintain up-to-date network diagrams in your documentation system (IT Glue, etc.).',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Network diagrams up to date and stored in documentation platform' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No current network documentation; diagrams outdated or missing' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is internet redundancy (failover connection) in place?', weight: 20, sort_order: 3,
          remediation_tips: 'Add secondary ISP connection with automatic failover for critical business locations.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Secondary ISP connection with automatic failover configured' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Single ISP connection with no redundancy' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is network monitoring and alerting configured?', weight: 20, sort_order: 4,
          remediation_tips: 'Deploy SNMP or flow-based monitoring. Alert on critical device down, high utilization.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Active SNMP or flow monitoring with alerting on critical events' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No proactive network monitoring; issues discovered reactively' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Firewall & Security', weight: 16, sort_order: 3,
      items: [
        {
          title: 'Is a business-grade next-generation firewall (NGFW) in place?', weight: 14, sort_order: 0,
          remediation_tips: 'Replace consumer-grade or EOL firewalls with NGFW (Fortinet, Palo Alto, SonicWall, etc.).',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'NGFW (Fortinet, SonicWall, Palo Alto, etc.) deployed and managed' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Consumer-grade or EOL firewall in use' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is administrative access to the firewall restricted to trusted IPs only?', weight: 14, sort_order: 1,
          remediation_tips: 'Limit firewall admin access to internal subnets and known public IPs. Disable default admin accounts.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Admin access restricted to internal IPs; default admin accounts disabled' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Firewall admin accessible from any IP or using default credentials' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is the firewall under an active support/subscription contract?', weight: 14, sort_order: 2,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Active support and security subscription contract in place' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Support/subscription expired; no access to threat intelligence or vendor support' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is DNS filtering/security (e.g., Cisco Umbrella, DNSFilter) in place?', weight: 15, sort_order: 3,
          remediation_tips: 'Deploy DNS filtering to block malicious domains and enforce acceptable use policies.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'DNS filtering deployed and covering all devices including roaming' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No DNS filtering; malicious domains not blocked at DNS layer' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is multi-factor authentication required for VPN and remote access?', weight: 14, sort_order: 4,
          remediation_tips: 'Enforce MFA on all VPN and remote access methods. Remove password-only access.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'MFA enforced on all VPN and remote access connections' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Password-only VPN or remote access in use' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are firewall rules reviewed and cleaned up annually?', weight: 14, sort_order: 5,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Firewall rules reviewed annually; stale rules removed and documented' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Firewall rules never reviewed; accumulated stale and overly-permissive rules' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is intrusion prevention (IPS) enabled and monitored?', weight: 15, sort_order: 6,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'IPS enabled and alerts reviewed; signatures updated automatically' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'IPS disabled or not configured; network intrusion attempts go undetected' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Endpoint Protection', weight: 14, sort_order: 4,
      items: [
        {
          title: 'Is enterprise EDR (Endpoint Detection & Response) deployed to all devices?', weight: 25, sort_order: 0,
          remediation_tips: 'Deploy next-gen EDR (SentinelOne, CrowdStrike, Defender for Business) on all endpoints. Traditional AV is insufficient.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Next-gen EDR (SentinelOne, CrowdStrike, Defender for Business) on 100% of endpoints' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Legacy AV only, or EDR coverage incomplete across managed endpoints' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is full-disk encryption (BitLocker/FileVault) enabled on all laptops?', weight: 25, sort_order: 1,
          remediation_tips: 'Enable BitLocker on Windows laptops. Store recovery keys in your documentation system.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'BitLocker/FileVault enabled on all laptops; recovery keys escrowed' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Laptops without disk encryption; data at risk if device is lost or stolen' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are USB/removable media policies enforced?', weight: 25, sort_order: 2,
          remediation_tips: 'Configure endpoint policies to block or restrict unauthorized USB devices.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Endpoint policy blocks or restricts unauthorized USB and removable media' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No USB restrictions; removable media poses data theft and malware risk' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is application whitelisting or controlled folder access enabled?', weight: 25, sort_order: 3,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Application whitelisting or Controlled Folder Access active and enforced' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Users can run any application; no protection against unauthorized software' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Cloud & Microsoft 365', weight: 14, sort_order: 5,
      items: [
        {
          title: 'Is MFA enforced for all Microsoft 365 users?', weight: 20, sort_order: 0,
          remediation_tips: 'Enable MFA via Conditional Access policies. Disable legacy authentication protocols.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'MFA enforced via Conditional Access for all M365 users; legacy auth blocked' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'MFA not enforced for all M365 users; some accounts password-only' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are Microsoft 365 licenses appropriate for the business needs?', weight: 20, sort_order: 1,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'License assignment reviewed; right-sized for current needs with no over/under provisioning' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'License assignment not reviewed; potential over-payment or compliance risk' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is email spam/phishing filtering beyond M365 defaults in place?', weight: 20, sort_order: 2,
          remediation_tips: 'Add third-party email security (Proofpoint, Mimecast, Defender for Office 365 Plan 2).',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Third-party email security or Defender for Office P2 in place' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Relying on default M365 spam filtering only; enhanced protection not deployed' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are DMARC, DKIM, and SPF records properly configured?', weight: 20, sort_order: 3,
          remediation_tips: 'Configure SPF, DKIM, and DMARC records for all sending domains. Set DMARC to reject/quarantine.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'SPF, DKIM, and DMARC records properly configured; DMARC set to reject/quarantine' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Email authentication records missing or misconfigured; domain spoofing risk' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is cloud data backed up (M365 mailboxes, SharePoint, OneDrive)?', weight: 20, sort_order: 4,
          remediation_tips: 'Microsoft does not back up M365 data. Implement third-party backup (Veeam, Datto, Acronis).',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'M365 mailboxes, SharePoint, and OneDrive backed up by a third-party solution' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No third-party M365 backup; data relies solely on Microsoft\'s retention policies' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Security Awareness & Compliance', weight: 12, sort_order: 6,
      items: [
        {
          title: 'Is security awareness training conducted at least annually?', weight: 25, sort_order: 0,
          remediation_tips: 'Implement ongoing security awareness training (KnowBe4, Proofpoint Security Awareness). Supplement with simulated phishing.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Annual security awareness training completed by all staff with documented completion' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No formal security awareness training program in place' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are simulated phishing campaigns run regularly?', weight: 25, sort_order: 1,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Phishing simulations run monthly or quarterly; click rates tracked and improving' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No phishing simulations; staff susceptibility to phishing attacks unknown' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is dark web monitoring in place for company email domains?', weight: 25, sort_order: 2,
          remediation_tips: 'Monitor for credential exposure on dark web marketplaces. Alert and force password resets when found.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Active dark web monitoring for company email domains with alerting' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No dark web monitoring; credential exposure may go undetected' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is a written acceptable use policy (AUP) in place and signed by staff?', weight: 25, sort_order: 3,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'AUP documented, distributed to all staff, and signed on hire and annually' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No formal AUP; staff lack clear guidance on acceptable technology use' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
    {
      name: 'Business Continuity & Disaster Recovery', weight: 12, sort_order: 7,
      items: [
        {
          title: 'Is a Business Continuity Plan (BCP) documented and tested?', weight: 20, sort_order: 0,
          remediation_tips: 'Document RTO/RPO requirements. Test recovery procedures annually.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'BCP documented with RTO/RPO targets; tested and updated annually' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No formal BCP; recovery procedures are ad-hoc and untested' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are off-site or cloud backups in place for all critical data?', weight: 20, sort_order: 1,
          remediation_tips: 'Implement 3-2-1 backup rule: 3 copies, 2 media types, 1 offsite.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Off-site or cloud backup copies in place for all critical data' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No off-site backup; all copies co-located with primary systems' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Are backup restore tests performed and documented quarterly?', weight: 20, sort_order: 2,
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Restore tests performed quarterly with documented results and recovery time validation' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Restore tests not performed or not documented; recovery capability unverified' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is there a documented cybersecurity incident response plan?', weight: 20, sort_order: 3,
          remediation_tips: 'Create and rehearse an incident response plan. Include contact list for legal, insurance, and regulatory notifications.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Incident response plan documented, rehearsed, and includes legal/insurance contacts' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No incident response plan; breach response would be ad-hoc and delayed' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
        {
          title: 'Is cyber liability insurance in place?', weight: 20, sort_order: 4,
          remediation_tips: 'Ensure cyber liability coverage is adequate and up to date. Review coverage limits annually.',
          responses: [
            { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Cyber liability insurance policy active with adequate coverage limits reviewed annually' },
            { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'No cyber liability insurance; financial exposure to breach costs is uncovered' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
          ]
        },
      ]
    },
  ]
}

const LCI_TEMPLATE = {
  name: 'Infrastructure Standards Review',
  description: 'Technology infrastructure review using scored response tiers: Satisfactory, Needs Attention, At Risk, Not Applicable.',
  is_default: false,
  sections: [
    {
      name: 'Infrastructure & Hosting', weight: 18, sort_order: 0,
      items: [
        {
          title: 'Infrastructure hosting model', description: 'Assesses whether infrastructure is hosted in modern, scalable environments vs. legacy on-premises setups.', weight: 17, sort_order: 0,
          scoring_instructions: 'Evaluate hosting approach — cloud/colo indicates modern thinking, self-hosted may signal budget constraints or legacy mindset.',
          remediation_tips: 'Cloud-first strategy reduces capital expenditure and improves scalability. Start with hybrid approach if full migration is not feasible.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Primarily cloud-hosted or professional colocation with proper redundancy' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Mix of self-hosted and some cloud services, inconsistent approach' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Entirely self-hosted in office/closet with no redundancy' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No servers or infrastructure' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Virtualization platform and architecture', weight: 17, sort_order: 1,
          remediation_tips: 'Implement hypervisor-based virtualization to improve hardware utilization and enable rapid recovery.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Modern hypervisor platform (Hyper-V, VMware, or cloud-native) in use' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Mix of physical and virtual, inconsistent virtualization strategy' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Primarily physical servers or aging virtualization platform' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No on-premises servers requiring virtualization' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Server hardware age and support status', weight: 17, sort_order: 2,
          remediation_tips: 'Replace hardware older than 5 years. Unsupported hardware increases failure risk and limits security patch availability.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All servers within 5-year lifecycle and under active vendor support' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Some servers approaching end of life (3–5 years), support contracts lapsing' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'One or more servers beyond 5 years old or on unsupported hardware' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No on-premises server hardware' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Operating system versions and support status', weight: 16, sort_order: 3,
          remediation_tips: 'Upgrade all systems to supported OS versions. Create a roadmap for EOL systems.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All servers and endpoints on current, vendor-supported OS versions' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Some systems on older but still supported OS versions, upgrade planned' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'One or more systems on end-of-life operating systems (e.g. Windows Server 2012, Windows 10)' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No managed operating systems in scope' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Power protection and environmental controls', weight: 17, sort_order: 4,
          remediation_tips: 'Install UPS with proper runtime. Implement temperature monitoring and alerting in server rooms.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'UPS with adequate runtime, temperature monitoring, and alerting in place' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'UPS in place but undersized or lacking monitoring; environmental controls incomplete' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No UPS or environmental controls; equipment at risk from power events or overheating' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No on-premises equipment requiring power protection' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Internet connectivity and redundancy', weight: 16, sort_order: 5,
          remediation_tips: 'Add secondary ISP from a different provider. Configure automatic failover.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Primary and secondary ISP with automatic failover configured' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Single ISP with no automatic failover; secondary connection being considered' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Single ISP connection with no redundancy; business-critical operations at risk of outage' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client operates fully in-cloud or has no business-critical connectivity dependency' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
    {
      name: 'Network & Security', weight: 20, sort_order: 1,
      items: [
        {
          title: 'Network segmentation and VLAN strategy', weight: 17, sort_order: 0,
          remediation_tips: 'Implement VLANs to separate critical systems, guest access, IoT devices, and production workloads.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'VLANs implemented — production, guest, IoT, and management traffic separated' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Partial segmentation in place; some traffic mixing between production and guest/IoT' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Flat network — all devices share the same broadcast domain with no segmentation' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Network scope too small to require formal segmentation' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Wireless network security and guest access', weight: 17, sort_order: 1,
          remediation_tips: 'Separate guest Wi-Fi on isolated VLAN. Use WPA3 or WPA2-Enterprise for corporate wireless.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Corporate and guest Wi-Fi are isolated VLANs; WPA2-Enterprise or WPA3 in use' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Guest Wi-Fi present but not fully isolated; corporate uses WPA2-PSK only' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No guest network separation; guests can reach internal resources via wireless' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No wireless networking in use' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Firewall and unified threat management', weight: 17, sort_order: 2,
          remediation_tips: 'Deploy NGFW with IPS, application control, and active subscription. Review rules annually.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Business-grade NGFW with IPS, content filtering, and active support subscription' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Business firewall in place but security subscriptions lapsed or features disabled' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Consumer-grade firewall, EOL hardware, or no active threat management features' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client operates fully in cloud with no on-premises perimeter' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'VPN and remote access security', weight: 16, sort_order: 3,
          remediation_tips: 'Require MFA on all VPN connections. Consider Zero Trust Network Access (ZTNA) as an alternative.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'MFA enforced on all VPN and remote access; modern protocol (ZTNA or SSL VPN)' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'VPN in place but MFA not enforced; some users using insecure remote access methods' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'RDP exposed to internet, no MFA on remote access, or insecure VPN protocol in use' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No remote access required for this client' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'DNS security and content filtering', weight: 17, sort_order: 4,
          remediation_tips: 'Deploy DNS filtering (Umbrella, DNSFilter) to block malicious domains at the DNS layer.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'DNS filtering deployed on all endpoints and networks including roaming users' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'DNS filtering on-premises only; roaming users or some segments not covered' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No DNS filtering in place; malicious domains are not blocked at the DNS layer' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client has an equivalent control through another mechanism' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Network monitoring and alerting', weight: 16, sort_order: 5,
          remediation_tips: 'Implement SNMP monitoring. Alert on device outages, high utilization, and anomalies.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Active monitoring with alerting on device outages, utilization, and anomalies' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Basic monitoring in place but alerting is incomplete or inconsistently reviewed' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No formal network monitoring; issues discovered reactively after impact' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Network scope managed entirely by a third party with SLA-backed monitoring' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
    {
      name: 'Endpoint Protection', weight: 18, sort_order: 2,
      items: [
        {
          title: 'Antivirus and endpoint detection & response (EDR)', weight: 25, sort_order: 0,
          remediation_tips: 'Replace legacy AV with next-gen EDR. Ensure 100% deployment coverage across all managed endpoints.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Next-gen EDR deployed to 100% of managed endpoints with active monitoring' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'EDR deployed but coverage is incomplete; some endpoints running legacy AV only' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No EDR deployed; legacy AV only or no endpoint protection on critical systems' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No managed endpoints in scope' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Device encryption and data protection', weight: 25, sort_order: 1,
          remediation_tips: 'Enable BitLocker/FileVault on all laptops and portable devices. Centrally manage encryption keys.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Full disk encryption enabled on all laptops; recovery keys centrally managed' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Encryption deployed on most devices; some laptops or portable media unencrypted' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No encryption on portable devices; sensitive data at high risk if hardware is lost or stolen' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No portable devices; all endpoints are fixed workstations in a secure facility' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Patch management and update process', weight: 25, sort_order: 2,
          remediation_tips: 'Automate patch deployment via RMM. Achieve 95%+ patch compliance within 30 days of release.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Automated patching achieving 95%+ compliance within 30 days of release' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Patch management process in place but compliance below 90%; some systems delayed' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No automated patching; systems significantly behind on critical security updates' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Patch management handled directly by the client under a documented process' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Application control and software restrictions', weight: 25, sort_order: 3,
          remediation_tips: 'Implement application whitelisting or controlled folder access to prevent unauthorized software execution.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Application whitelisting or controlled folder access preventing unauthorized software' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Basic software restriction policies in place but not comprehensive; gaps exist' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No application control; users can install any software without restriction' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client environment does not require application control based on risk profile' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
    {
      name: 'Identity & Access Management', weight: 16, sort_order: 3,
      items: [
        {
          title: 'Multi-factor authentication coverage', weight: 25, sort_order: 0,
          remediation_tips: 'Enforce MFA for all users on all cloud services and VPN. Eliminate password-only access.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'MFA enforced on all users for all cloud services, VPN, and admin portals' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'MFA enabled for most users but some accounts or services remain password-only' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'MFA not enforced; most or all access secured by password only' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client has no cloud services or remote access requiring MFA' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Privileged access management', weight: 25, sort_order: 1,
          remediation_tips: 'Implement least-privilege access. Use separate admin accounts. Deploy PAM solution for shared credentials.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Dedicated admin accounts used; least-privilege enforced; shared credentials eliminated' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Admin accounts partially separated; some shared credentials or over-privileged accounts remain' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No PAM practices; admin access shared, undocumented, or using personal accounts' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client scope does not include systems requiring elevated access management' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'User offboarding and access revocation', weight: 25, sort_order: 2,
          remediation_tips: 'Document offboarding checklist. Ensure all access is revoked within 24 hours of departure.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Formal offboarding checklist; all access revoked within 24 hours of departure' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Offboarding process exists but not consistently followed; some stale accounts found' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No formal offboarding; departed employees may retain active accounts and access' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client has no employee turnover risk or a fully managed HR-IT integration process' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Password policy and credential hygiene', weight: 25, sort_order: 3,
          remediation_tips: 'Enforce strong passwords (14+ chars) or passphrases. Deploy password manager for staff.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Strong password policy enforced (14+ chars, no reuse) and password manager in use' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Password policy in place but not fully enforced; no password manager deployed' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Weak or no password policy; passwords reused, shared, or stored insecurely' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Single sign-on with MFA covers all access; traditional passwords not used' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
    {
      name: 'Backup & Disaster Recovery', weight: 14, sort_order: 4,
      items: [
        {
          title: 'Server and VM backup coverage', weight: 20, sort_order: 0,
          remediation_tips: 'Ensure all servers and VMs are included in backup jobs. Verify daily job completion.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All servers and VMs in backup jobs; daily completion verified and alerted' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Most servers covered but some gaps in backup jobs or inconsistent job completion' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Backup coverage is incomplete or backups are failing without detection' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'No on-premises servers or VMs in scope' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Cloud and SaaS data backup', weight: 20, sort_order: 1,
          remediation_tips: 'Back up M365, Google Workspace, and other SaaS platforms. Vendor retention is not a substitute for backup.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'M365, Google Workspace, and key SaaS platforms backed up by a third-party solution' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Some SaaS platforms backed up but coverage is incomplete (e.g. SharePoint not included)' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No third-party backup for cloud data; relying solely on vendor retention policies' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client does not use SaaS platforms containing business-critical data' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Backup immutability and ransomware protection', weight: 20, sort_order: 2,
          remediation_tips: 'Implement immutable backups (WORM) so ransomware cannot encrypt backup data.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Immutable (WORM) backups in place; backup storage is isolated from production' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Backups exist but are not immutable; ransomware could potentially encrypt backup data' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No backup immutability; backup targets accessible from production network' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Backup strategy managed and guaranteed immutable by a third-party provider' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Recovery testing cadence', weight: 20, sort_order: 3,
          remediation_tips: 'Test restores quarterly. Document RTO/RPO targets and verify backups meet them.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Restore tests conducted quarterly with documented RTO/RPO validation' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Restore tests performed but irregularly; documentation of results incomplete' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Backups have never been tested or testing is more than 12 months overdue' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Recovery testing performed and documented by a managed backup provider' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Offsite and geographically separated backup copy', weight: 20, sort_order: 4,
          remediation_tips: 'Maintain at least one backup copy offsite or in a separate cloud region from primary systems.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'At least one backup copy stored offsite or in a separate cloud region from primary' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Offsite backup in place but in the same geographic region as primary systems' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'All backups co-located with primary systems; a site disaster would destroy both' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Backup architecture already inherently geographically distributed' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
    {
      name: 'Documentation & Processes', weight: 14, sort_order: 5,
      items: [
        {
          title: 'Network and infrastructure documentation', weight: 25, sort_order: 0,
          remediation_tips: 'Maintain current network diagrams, IP addressing, and hardware inventory in a documentation platform.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Current network diagrams, IP addressing, and hardware inventory in documentation platform' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Documentation exists but is outdated or incomplete; diagrams not current' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No formal documentation; network and infrastructure knowledge is undocumented' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client environment is too small to require formal infrastructure documentation' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Credentials and password management', weight: 25, sort_order: 1,
          remediation_tips: 'Store all credentials in a secure password manager (IT Glue, 1Password Teams). No spreadsheets.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'All credentials stored in a secure password manager (IT Glue, 1Password Teams); no spreadsheets' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Password manager in place but not fully adopted; some credentials stored outside it' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Credentials stored in spreadsheets, email, or shared documents with no access control' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Single sign-on manages all access; no shared credentials in scope' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Change management and approval process', weight: 25, sort_order: 2,
          remediation_tips: 'Implement formal change management for all infrastructure changes. Document approvals.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Formal change management process with documented approvals for all infrastructure changes' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Informal change management; major changes documented but minor changes often untracked' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No change management; infrastructure changes made ad-hoc without documentation or approval' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client environment is in a managed service contract that handles change management' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
        {
          title: 'Vendor and contract management', weight: 25, sort_order: 3,
          remediation_tips: 'Maintain a current inventory of all vendor contracts, renewal dates, and contact information.',
          responses: [
            { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Complete inventory of vendor contracts, renewal dates, and contacts maintained and current' },
            { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Most contracts documented but some missing or renewal dates not tracked' },
            { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'No vendor contract inventory; renewal dates and terms are unknown or untracked' },
            { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Client manages vendor contracts directly; not in scope for MSP services' },
            { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
          ]
        },
      ]
    },
  ]
}

const DEFAULT_RESPONSES_YN = [
  { label: 'Yes', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Fully in place and meeting the standard' },
  { label: 'No', color_code: 'at_risk', sort_order: 1, is_aligned: false, description: 'Not in place — remediation required' },
  { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 2, is_aligned: true, description: 'Does not apply to this client environment' },
]
const DEFAULT_RESPONSES_MULTI = [
  { label: 'Satisfactory', color_code: 'satisfactory', sort_order: 0, is_aligned: true, description: 'Fully implemented and meeting the standard' },
  { label: 'Needs Attention', color_code: 'needs_attention', sort_order: 1, is_aligned: false, description: 'Partially in place but requires improvement' },
  { label: 'At Risk', color_code: 'at_risk', sort_order: 2, is_aligned: false, description: 'Not implemented or critically deficient' },
  { label: 'Not Applicable', color_code: 'not_applicable', sort_order: 3, is_aligned: true, description: 'Does not apply to this client environment' },
  { label: 'Acceptable Risk', color_code: 'acceptable_risk', sort_order: 4, is_aligned: true, description: 'Risk acknowledged and accepted by the client' },
]

async function seedTemplate(client, tenantId, template) {
  const tmplRes = await client.query(
    `INSERT INTO assessment_templates (tenant_id, name, description, is_default, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW()) RETURNING id`,
    [tenantId, template.name, template.description, template.is_default]
  )
  const tmplId = tmplRes.rows[0].id
  console.log(`  Created template: ${template.name} (${tmplId})`)

  for (const sec of template.sections) {
    const secRes = await client.query(
      `INSERT INTO template_sections (template_id, name, description, weight, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tmplId, sec.name, sec.description || null, sec.weight, sec.sort_order]
    )
    const secId = secRes.rows[0].id

    for (const item of sec.items) {
      const itemType = item.item_type || (template.is_default ? 'yes_no' : 'multi_response')
      const itemRes = await client.query(
        `INSERT INTO template_items (section_id, template_id, title, description, item_type, weight, scoring_instructions, remediation_tips, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [secId, tmplId, item.title, item.description || null, itemType,
         item.weight, item.scoring_instructions || null, item.remediation_tips || null, item.sort_order]
      )
      const itemId = itemRes.rows[0].id

      const responses = item.responses || (itemType === 'yes_no' ? DEFAULT_RESPONSES_YN : DEFAULT_RESPONSES_MULTI)
      for (let ri = 0; ri < responses.length; ri++) {
        const r = responses[ri]
        await client.query(
          `INSERT INTO template_item_responses (item_id, label, color_code, description, sort_order, is_aligned)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, r.label, r.color_code, r.description || null, r.sort_order != null ? r.sort_order : ri, r.is_aligned ?? false]
        )
      }
    }
    console.log(`    Section: ${sec.name} (${sec.items.length} items)`)
  }
}

async function main() {
  const client = await pool.connect()
  try {
    const tenantRes = await client.query(`SELECT id FROM tenants LIMIT 1`)
    if (!tenantRes.rows.length) { console.error('No tenants found'); return }
    const tenantId = tenantRes.rows[0].id
    console.log(`Seeding templates for tenant ${tenantId}`)

    // Check if already seeded
    const existing = await client.query(`SELECT COUNT(*) FROM assessment_templates WHERE tenant_id = $1`, [tenantId])
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Templates already seeded — skipping')
      return
    }

    await client.query('BEGIN')
    await seedTemplate(client, tenantId, MITP_TEMPLATE)
    await seedTemplate(client, tenantId, LCI_TEMPLATE)
    await client.query('COMMIT')
    console.log('Done!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', err.message)
    console.error(err.stack)
  } finally {
    client.release()
    pool.end()
  }
}
main()
