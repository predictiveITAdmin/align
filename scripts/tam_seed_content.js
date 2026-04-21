/**
 * TAM Standards Content Seed — Populates how_to_find, why_we_ask,
 * business_impact, and technical_rationale for all 134 universal standards.
 *
 * Usage: node scripts/tam_seed_content.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT, 10),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
})

// ── Content Map: keyed by standard UUID ──
const contentMap = {
  // ═══════════════════════════════════════════════════════════════
  //  ENDPOINT MANAGEMENT — Remote Management & Monitoring
  // ═══════════════════════════════════════════════════════════════
  '869ce5d3-e92a-461c-99d3-6016ffb25ac4': {
    // RMM agent checking in (online) on all managed endpoints
    how_to_find: 'Check Datto RMM dashboard for device online/offline status. Filter by client site and look for any devices showing "offline" for more than 24 hours. Cross-reference with Autotask asset list to confirm expected device count. This can be automated via the Datto RMM API device status endpoint.',
    why_we_ask: 'If we cannot see your computers, we cannot protect or manage them. A device that stops checking in could be stolen, compromised, or simply turned off — and we would have no way to know until a problem surfaces.',
    business_impact: 'Unmonitored devices create blind spots where malware, hardware failure, or data loss can occur without detection, leading to extended downtime and potential data breaches.',
    technical_rationale: 'Continuous RMM agent heartbeat is foundational to managed services delivery. CIS Control 1 (Inventory and Control of Enterprise Assets) requires real-time visibility into all managed devices.',
  },
  'ca945e4d-3a0a-4393-8c45-3288ca6d00e1': {
    // RMM agent installed on all managed endpoints
    how_to_find: 'Compare Datto RMM device count against Autotask configuration items and Active Directory / Entra ID device list. Look for any devices in AD or Autotask that do not appear in RMM. Run a network scan via Auvik to identify unmanaged devices on the network.',
    why_we_ask: 'Every computer we manage needs our monitoring software installed. Devices without it are invisible to us — we cannot patch them, secure them, or respond to problems. This is the foundation of everything we do for you.',
    business_impact: 'Endpoints without RMM are unpatched, unmonitored, and unprotected — they become the easiest entry point for attackers and the most likely source of undetected hardware failures.',
    technical_rationale: 'Full RMM coverage is prerequisite for patch management, endpoint security, and remote support. CIS Control 1 mandates a complete inventory of managed assets with active management agents.',
  },
  '47d182c1-01f9-4c8f-a295-1bb1bd1e8f6b': {
    // RMM monitoring policies applied per client standard
    how_to_find: 'In Datto RMM, navigate to the client site and review the monitoring policies assigned. Verify that disk, CPU, memory, service, and event log monitors match the client-specific or default monitoring template. Check for policy drift by comparing against the documented standard in IT Glue.',
    why_we_ask: 'Monitoring policies are how we detect problems before they become outages. Without properly configured alerts, a failing hard drive or critical service crash could go unnoticed until it impacts your team.',
    business_impact: 'Missing or misconfigured monitoring delays detection of hardware failures, service outages, and security events — turning a minor issue into an extended outage.',
    technical_rationale: 'Standardized monitoring policies ensure consistent alerting thresholds and reduce noise. This aligns with ITIL event management practices and ensures SLA-relevant issues are detected promptly.',
  },
  '51d5f5f3-a65b-4904-b0ce-8b7ebeb6a2ae': {
    // RMM site/client correctly assigned (no orphan devices)
    how_to_find: 'In Datto RMM, filter devices by "Default" or "Unassigned" site. Check for any devices that appear under the wrong client or in a catch-all group. Cross-reference hostnames against Autotask company records and IT Glue configurations.',
    why_we_ask: 'When a device is assigned to the wrong client, alerts go to the wrong team, reports are inaccurate, and security policies may not apply correctly. Proper organization ensures every device gets the right level of care.',
    business_impact: 'Orphaned or misassigned devices receive incorrect policies, patches, and monitoring — leading to inaccurate reporting and potential security gaps.',
    technical_rationale: 'Proper device-to-tenant mapping is essential for multi-tenant MSP operations. Misassignment breaks automated workflows, compliance reporting, and per-client SLA tracking.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  ENDPOINT MANAGEMENT — Endpoint Security Posture
  // ═══════════════════════════════════════════════════════════════
  '38e9d337-e96f-424d-9f1c-cf3d21dc2849': {
    // BitLocker recovery keys escrowed to Entra ID / IT Glue
    how_to_find: 'Check Entra ID > Devices > select device > BitLocker keys to verify escrow. In IT Glue, search for the device configuration and look for a BitLocker recovery key in embedded passwords. Datto RMM can also report BitLocker status via a component/monitor.',
    why_we_ask: 'If a computer locks up or a hard drive needs recovery, we need the encryption key to access your data. Without it stored safely, a locked device could mean permanent data loss.',
    business_impact: 'Lost BitLocker keys can render an encrypted device permanently inaccessible, resulting in complete data loss for that endpoint and potential downtime while the device is rebuilt.',
    technical_rationale: 'NIST SP 800-111 and CIS Control 3.6 require encryption key management with centralized escrow. Without escrowed keys, encrypted drives become unrecoverable during hardware failure or password reset scenarios.',
  },
  'ae81f58b-b79c-4044-b63f-614d32ed2c2d': {
    // Disk encryption (BitLocker/FileVault) enabled on all endpoints
    how_to_find: 'Run a Datto RMM component to check BitLocker/FileVault status across all endpoints. In Entra ID, check the device blade for encryption status. For Intune-managed devices, review the encryption compliance policy report. This is fully automatable via RMM scripting.',
    why_we_ask: 'Disk encryption protects your company data if a laptop is lost or stolen. Without it, anyone who picks up the device can access every file on it — client records, financial data, passwords, everything.',
    business_impact: 'An unencrypted lost or stolen device exposes all stored data, potentially triggering breach notification requirements, regulatory fines, and reputational damage.',
    technical_rationale: 'Full disk encryption is required by NIST SP 800-171, HIPAA, PCI-DSS, and CIS Control 3.6. It is the primary control against data exposure from physical device loss.',
  },
  '61facada-a19c-4085-809c-d0bb03316061': {
    // EDR/AV definitions current (updated within 24 hours)
    how_to_find: 'Check the EDR/AV management console (SentinelOne, Huntress, or Defender for Endpoint) for agent version and definition dates. In Datto RMM, use an audit component that reports AV definition age. Flag any devices with definitions older than 24 hours.',
    why_we_ask: 'Antivirus software is only as good as its latest update. New threats emerge daily — if your protection is even a day behind, a brand-new virus could slip right past it.',
    business_impact: 'Outdated definitions leave endpoints vulnerable to the latest malware variants, increasing the risk of ransomware infection, data theft, and lateral movement across the network.',
    technical_rationale: 'CIS Control 10 requires anti-malware with automated definition updates. Stale definitions significantly reduce detection efficacy against zero-day and emerging threats.',
  },
  '4b5bbbc7-be17-477a-8499-db951bd25199': {
    // EDR/AV real-time protection active (not disabled)
    how_to_find: 'Check the EDR console for any agents in "passive" or "disabled" state. In Datto RMM, use a monitor that checks the Windows Security Center status for real-time protection. Look for users who may have disabled protection to install software.',
    why_we_ask: 'Real-time protection is what catches threats the moment they appear. If it has been turned off — even temporarily — your computer is completely exposed until it is re-enabled.',
    business_impact: 'Disabled real-time protection leaves the endpoint fully exposed to malware execution, making it a zero-resistance entry point for ransomware and data exfiltration.',
    technical_rationale: 'Real-time scanning is a critical compensating control per CIS Control 10.1. Disabled protection is a common indicator of compromise or user circumvention that must be immediately remediated.',
  },
  '14ad7b04-ed8e-40ac-8526-aebe05482a34': {
    // EDR/AV solution deployed on all managed endpoints
    how_to_find: 'Compare the EDR/AV console device list against Datto RMM and Autotask configuration items. Identify any devices present in RMM but missing from the EDR console. Automated checks via RMM components can detect missing AV installations.',
    why_we_ask: 'Every computer needs antivirus and threat detection software. Even one unprotected device can be the entry point for an attack that spreads to your entire network.',
    business_impact: 'A single unprotected endpoint can serve as the initial infection vector for ransomware or data breach, potentially compromising the entire organization.',
    technical_rationale: 'CIS Control 10 requires endpoint protection on all managed assets. EDR provides detection, response, and forensic capabilities beyond traditional AV, which is essential for modern threat defense.',
  },
  '95aefc30-a311-434e-9d70-a372f23994e5': {
    // Local administrator accounts restricted (standard users for daily use)
    how_to_find: 'In Datto RMM, run a component that enumerates local Administrators group membership on each endpoint. Check Intune or Group Policy for policies that restrict local admin. Review IT Glue for the client standard on local admin access.',
    why_we_ask: 'When users run as administrators, any malware they accidentally download runs with full system access. Restricting daily-use accounts to standard user significantly reduces the blast radius of any security incident.',
    business_impact: 'Users running as local administrators dramatically increase the severity of malware infections, as malicious code inherits full system privileges and can install rootkits, disable security tools, and spread laterally.',
    technical_rationale: 'Principle of least privilege is mandated by CIS Control 5.4 and NIST SP 800-53 AC-6. Removing local admin rights is one of the most effective single controls against malware execution.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  ENDPOINT MANAGEMENT — Endpoint Configuration & Standards
  // ═══════════════════════════════════════════════════════════════
  'eb373638-360b-4b60-a917-4fb22fdc432e': {
    // Application patches applied within 30 days of release
    how_to_find: 'Check Datto RMM patch management reports for third-party application patch status. Review any third-party patching tool (Chocolatey, Ninite, Patch My PC) deployment logs. Filter for applications with patches pending more than 30 days.',
    why_we_ask: 'Outdated software is one of the most common ways attackers get into systems. Keeping applications patched within 30 days closes known security holes before they can be exploited.',
    business_impact: 'Unpatched applications are the primary attack vector for exploitation. Delayed patching leaves known vulnerabilities open that automated scanning tools and attackers actively target.',
    technical_rationale: 'CIS Control 7.4 requires timely patching of applications. CISA and NIST recommend a 30-day remediation window for non-critical and 14 days for critical vulnerabilities.',
  },
  'b1708adc-a9f2-4ef7-80b3-6313956b2e7e': {
    // Endpoint meets minimum hardware specification
    how_to_find: 'Pull hardware audit data from Datto RMM — check CPU model/generation, RAM, and disk type/size. ScalePad Lifecycle Manager provides automated hardware scoring and flags devices below spec. Cross-reference with Autotask configuration items for warranty and age data.',
    why_we_ask: 'Underpowered hardware slows your team down, causes crashes, and cannot run modern security software properly. Minimum specs ensure your team can work efficiently and stay protected.',
    business_impact: 'Substandard hardware causes daily productivity loss through slow performance, application crashes, and inability to run required security tools — directly impacting employee output and satisfaction.',
    technical_rationale: 'Modern endpoint security tools (EDR, disk encryption, cloud sync) require adequate CPU, RAM, and SSD storage to function without degrading user experience. Minimum specs ensure security and productivity coexist.',
  },
  'ea711511-e039-4ecf-823d-afa81899b96b': {
    // Operating system is vendor-supported (not EOL)
    how_to_find: 'Datto RMM reports OS version for every endpoint. Filter for Windows 10 builds nearing EOL, Windows 8.1/7, or macOS versions past Apple support. ScalePad flags EOL operating systems automatically. Cross-reference with Microsoft lifecycle documentation.',
    why_we_ask: 'When an operating system reaches end-of-life, it stops receiving security updates. That means new vulnerabilities will never be patched, making those computers permanent security risks on your network.',
    business_impact: 'EOL operating systems receive no security patches, creating permanent unmitigable vulnerabilities. Many cyber insurance policies and compliance frameworks explicitly exclude or penalize EOL systems.',
    technical_rationale: 'CIS Control 2.2 mandates that only vendor-supported software runs in production. Running EOL systems violates NIST SP 800-53 SI-2 and most compliance frameworks (HIPAA, PCI-DSS, CMMC).',
  },
  '74fe6ca9-a37f-4756-aebb-b29b8bceebd3': {
    // OS patches applied within 30 days (critical within 14 days)
    how_to_find: 'Review Datto RMM patch management dashboard for pending Windows/macOS updates. Filter for patches older than 30 days (or 14 days for critical/zero-day). Check WSUS or Intune patch compliance reports if applicable. Automated RMM patch policies should handle scheduling.',
    why_we_ask: 'Operating system patches fix security vulnerabilities that attackers actively exploit. The longer a patch sits unapplied, the more time attackers have to use that known weakness against you.',
    business_impact: 'Delayed OS patching is a leading cause of ransomware and breach incidents. Cyber insurance claims are frequently denied when patching timelines exceed industry standards.',
    technical_rationale: 'CISA BOD 22-01 mandates remediation of known exploited vulnerabilities within 14 days. CIS Control 7.3 requires automated OS patching with defined timelines. This is a top audit finding in most frameworks.',
  },
  'f4c202e5-92cb-4bbd-9bea-9f64be25299c': {
    // Screen lock enforced after 15 minutes of inactivity
    how_to_find: 'Check Intune device configuration profiles or Group Policy (Computer Configuration > Windows Settings > Security Settings > Local Policies > Security Options > Interactive logon: Machine inactivity limit). Datto RMM can audit the registry key for screen lock timeout.',
    why_we_ask: 'An unlocked, unattended computer is an open door. Screen lock ensures that if someone steps away, their computer is not accessible to anyone who walks by — whether in the office or at a coffee shop.',
    business_impact: 'Unlocked unattended devices enable unauthorized physical access to email, files, and applications — a common vector for insider threats and data exposure in shared or public environments.',
    technical_rationale: 'CIS Control 4.3 requires automatic screen locking after a period of inactivity. NIST SP 800-53 AC-11 mandates session lock. Most compliance frameworks require 15 minutes or less.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  ENDPOINT MANAGEMENT — Endpoint Lifecycle & Refresh
  // ═══════════════════════════════════════════════════════════════
  '002644a3-9d5c-4a69-9f13-e67034d27aec': {
    // All endpoints under active manufacturer warranty
    how_to_find: 'Check ScalePad Lifecycle Manager for warranty status across all devices. Cross-reference with Autotask configuration items (warranty expiration field). Datto RMM hardware audit provides serial numbers that can be checked against Dell, Lenovo, or HP warranty portals.',
    why_we_ask: 'When a computer is out of warranty and the hardware fails, repairs take longer and cost more — if parts are even available. Warranty coverage means faster replacements and predictable costs.',
    business_impact: 'Out-of-warranty hardware failures result in extended downtime (days vs. hours), unpredictable repair costs, and potential data loss if replacement parts are unavailable.',
    technical_rationale: 'Active warranty ensures vendor support and timely hardware replacement. Industry best practice is to keep all production endpoints under active warranty to maintain defined SLAs for hardware recovery.',
  },
  'b665631f-07fb-4bc2-a34f-17ceae1698f7': {
    // All endpoints within 5-year lifecycle (refresh plan documented)
    how_to_find: 'ScalePad Lifecycle Manager calculates device age and scores lifecycle status. Check Autotask configuration items for purchase date or first-seen date. Review IT Glue for the client hardware refresh plan document. Datto RMM hardware audit provides BIOS date as a proxy for device age.',
    why_we_ask: 'Computers older than five years are slower, break down more often, and cannot run the latest security software well. A refresh plan ensures you replace them on a schedule rather than scrambling when they die.',
    business_impact: 'Aging hardware causes increasing failure rates, productivity loss, and inability to support current OS and security requirements — leading to both unplanned costs and security gaps.',
    technical_rationale: 'A 5-year refresh cycle balances cost with reliability and security compatibility. Devices beyond this age typically fall outside vendor support and cannot meet modern hardware security requirements (TPM 2.0, Secure Boot).',
  },
  '621354bd-f847-43bd-aef7-c60540e699b7': {
    // Spare device inventory maintained for rapid replacement
    how_to_find: 'Check IT Glue for a documented spare inventory list. Review Autotask configuration items for devices tagged as "spare" or "inventory." Ask the client or TAM if pre-staged spares are kept on-site or at the office for rapid deployment.',
    why_we_ask: 'When a computer fails, your employee is stuck until we get a replacement. Having a spare ready means we can swap them out in hours instead of days, keeping your team productive.',
    business_impact: 'Without spare devices, a single hardware failure can result in 2-5 days of employee downtime while waiting for procurement and setup of a replacement.',
    technical_rationale: 'Maintaining hot or warm spares reduces mean time to restore (MTTR) for endpoint failures from days to hours. This is an operational resilience practice that directly impacts SLA compliance.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK INFRASTRUCTURE — Firewall & Perimeter Security
  // ═══════════════════════════════════════════════════════════════
  'eff9fa1a-16a2-4d06-9b74-7fc953aaf409': {
    // Content filtering / web category filtering active
    how_to_find: 'Log into the client firewall management console and check the web content filtering or URL filtering policies. In Auvik, verify the firewall is online and check configuration notes. Review IT Glue for the documented filtering policy and any exceptions.',
    why_we_ask: 'Web content filtering blocks access to known malicious websites and inappropriate content categories. This stops many malware infections before they start and helps maintain a professional work environment.',
    business_impact: 'Without content filtering, users can unknowingly visit malicious sites that deliver malware, ransomware, or credential-harvesting pages — a leading initial infection vector.',
    technical_rationale: 'CIS Control 9.2 requires DNS and web content filtering to block known malicious domains. Content filtering provides a defense-in-depth layer that reduces attack surface at the network perimeter.',
  },
  'f9619aa5-929b-44d0-b858-25e81ea983ae': {
    // Default credentials changed on all network devices
    how_to_find: 'Review IT Glue embedded passwords for network devices — check if they are set to non-default values. In Auvik, review device inventory and check for any alerts about default credentials. Attempt login with known default credentials (admin/admin, admin/password) during the assessment.',
    why_we_ask: 'Default passwords on network equipment are publicly known and are the first thing attackers try. If your firewall or switches still use factory credentials, anyone can take control of your network.',
    business_impact: 'Devices with default credentials can be trivially compromised, giving attackers full control of network routing, firewall rules, and traffic interception — enabling complete network takeover.',
    technical_rationale: 'CIS Control 4.7 mandates changing all default credentials. NIST SP 800-53 IA-5 requires unique, complex credentials for all system accounts. Default credentials are a critical finding in every security audit.',
  },
  '2a7c77b3-7abb-4cbb-8f75-517cd5f9e8dd': {
    // Enterprise-grade firewall deployed (not consumer router/modem)
    how_to_find: 'Check Auvik network topology for the perimeter device make/model. Review IT Glue network documentation for firewall details. Look for consumer brands (Netgear, TP-Link, Linksys) vs. business-class (Fortinet, SonicWall, Meraki, WatchGuard). Verify the device is not an ISP-provided modem/router combo.',
    why_we_ask: 'A consumer router does not have the security features your business needs — no intrusion prevention, no content filtering, no VPN capabilities, and no vendor security updates. A business firewall is your first line of defense.',
    business_impact: 'Consumer routers lack enterprise security features, firmware update support, and logging capabilities — leaving the network perimeter effectively undefended against modern threats.',
    technical_rationale: 'CIS Control 9.4 requires enterprise-grade network security devices with UTM capabilities. Business firewalls provide stateful inspection, IDS/IPS, VPN, and centralized logging that consumer devices cannot.',
  },
  '774aa4c6-9d32-4f2f-bb7e-26758b60297c': {
    // Firewall firmware is current (within one major version)
    how_to_find: 'Log into the firewall admin console and check the current firmware version. Compare against the vendor support page for the latest stable release. Auvik can track firmware versions and flag outdated devices. Document the current version in IT Glue.',
    why_we_ask: 'Firewall firmware updates patch security vulnerabilities and add new threat protections. Running outdated firmware means known exploits exist that attackers can use to bypass your firewall entirely.',
    business_impact: 'Outdated firewall firmware with known vulnerabilities can be exploited to bypass all perimeter security, potentially giving attackers unrestricted access to the internal network.',
    technical_rationale: 'CIS Control 2.2 requires vendor-supported software with current patches. Firewall CVEs are actively exploited (e.g., Fortinet, SonicWall RCEs) and are high-priority targets for threat actors.',
  },
  'a837446a-5785-445a-bf16-f732b95b25f3': {
    // Firewall management interface access restricted to trusted networks
    how_to_find: 'Log into the firewall admin console and review management access rules. Verify that HTTPS/SSH management is restricted to internal management VLAN or specific trusted IPs. Check that WAN-side management access is disabled or limited to VPN-only access.',
    why_we_ask: 'If your firewall management page is accessible from the internet, attackers can attempt to brute-force their way in or exploit vulnerabilities in the management interface. Restricting access to trusted networks eliminates this risk.',
    business_impact: 'Exposed management interfaces are actively scanned and exploited by automated botnets. A compromised firewall management interface gives attackers complete control over the network perimeter.',
    technical_rationale: 'CIS Control 4.8 and NIST SP 800-41 require restricting management plane access to trusted networks. Publicly exposed admin interfaces are a top finding in penetration tests and CISA advisories.',
  },
  'c610027b-170d-4243-adc1-4b8329200b2e': {
    // Firewall not within 6 months of end-of-life
    how_to_find: 'Check the firewall model against the vendor EOL/EOS (end-of-sale, end-of-support) announcements. ScalePad Lifecycle Manager tracks network device lifecycle. Review IT Glue for the documented firewall model and cross-reference with vendor lifecycle pages.',
    why_we_ask: 'When a firewall reaches end-of-life, the manufacturer stops releasing security updates. This means newly discovered vulnerabilities in your firewall will never be fixed, creating a permanent security gap at your front door.',
    business_impact: 'An EOL firewall with unpatched vulnerabilities is a critical risk — it cannot be remediated and must be replaced. Cyber insurance carriers increasingly require current, supported perimeter devices.',
    technical_rationale: 'CIS Control 2.1 requires only vendor-supported hardware in production. EOL network security appliances violate every major compliance framework and are uninsurable under most cyber policies.',
  },
  '32212478-6d46-428f-b7ec-10de62c0de85': {
    // Firewall under active vendor subscription (security services, updates)
    how_to_find: 'Log into the firewall admin console and check subscription/license status for security services (IPS, AV, web filtering, sandboxing). Verify expiration dates. Check the vendor portal for the device serial number license status. Document in IT Glue.',
    why_we_ask: 'Your firewall hardware is only part of the equation — the security subscriptions power the threat intelligence, content filtering, and intrusion prevention features. Without active subscriptions, those features stop working.',
    business_impact: 'Expired firewall subscriptions silently disable critical security features like IPS, AV scanning, and web filtering — leaving the firewall as little more than a basic router.',
    technical_rationale: 'UTM/NGFW security features require active subscription licenses to receive threat intelligence updates. Without them, the firewall loses its advanced security capabilities while appearing operational.',
  },
  '32334436-1910-4bc0-a0f9-92b58a7e07b1': {
    // IDS/IPS enabled on firewall (where supported)
    how_to_find: 'Log into the firewall admin console and navigate to the IDS/IPS or Intrusion Prevention settings. Verify it is enabled in "prevent" (not just "detect") mode on relevant interfaces. Check that the signature database is current and that logging is active.',
    why_we_ask: 'Intrusion prevention actively blocks known attack patterns as they cross your network boundary. Without it, the firewall only filters by port and IP — it cannot inspect traffic for malicious content.',
    business_impact: 'Without IPS, the firewall cannot detect or block exploit attempts, command-and-control traffic, or lateral movement techniques — reducing perimeter security to basic packet filtering.',
    technical_rationale: 'CIS Control 13.3 requires network-based intrusion detection/prevention. IDS/IPS provides deep packet inspection that complements stateful firewall rules and is required by PCI-DSS Requirement 11.4.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK INFRASTRUCTURE — Switching & Wireless
  // ═══════════════════════════════════════════════════════════════
  'edb6e004-bb5c-4995-8ab1-caa190d4f316': {
    // Enterprise-grade switches deployed (not consumer-grade)
    how_to_find: 'Check Auvik network inventory for switch make/model. Look for unmanaged consumer switches (Netgear unmanaged, TP-Link desktop) vs. managed enterprise switches (Cisco, Meraki, Aruba, UniFi). Review IT Glue network documentation for switch inventory.',
    why_we_ask: 'Consumer switches cannot support VLANs, access control, or monitoring. Enterprise switches let us segment your network, control traffic, and detect issues — all critical for security and performance.',
    business_impact: 'Consumer switches prevent network segmentation, making it impossible to isolate guest traffic, IoT devices, or sensitive systems — a single compromised device can reach everything.',
    technical_rationale: 'Managed switches are required for VLAN segmentation (CIS Control 12.2), 802.1X authentication, port security, and SNMP monitoring. Consumer switches provide no visibility or control.',
  },
  'fd8744c0-5677-460e-89ea-1ef08b853f60': {
    // Enterprise-grade wireless access points deployed
    how_to_find: 'Check Auvik for wireless AP inventory and model details. Review IT Glue network documentation for AP make/model. Look for consumer routers acting as APs vs. enterprise APs (Meraki, Aruba, UniFi). Verify centralized management and firmware status.',
    why_we_ask: 'Business-grade wireless access points provide stronger security, better performance under load, and centralized management. Consumer Wi-Fi routers lack the features needed to keep your wireless network secure and reliable.',
    business_impact: 'Consumer wireless devices lack enterprise authentication, rogue AP detection, and adequate capacity — leading to security vulnerabilities and unreliable connectivity that frustrates employees.',
    technical_rationale: 'Enterprise APs support WPA3-Enterprise, 802.1X RADIUS authentication, client isolation, and centralized management — all required by CIS Control 12 for wireless network security.',
  },
  '6204fc8d-3552-400c-b61c-5f31a5132c22': {
    // Guest wireless separated from corporate network (separate VLAN)
    how_to_find: 'Check the wireless controller or AP configuration for guest SSID settings. Verify the guest SSID is mapped to a separate VLAN that is isolated from the corporate network. In Auvik, review the network topology for VLAN segmentation. Test by connecting to guest Wi-Fi and confirming no access to internal resources.',
    why_we_ask: 'Visitors and personal devices on your network should not have access to your company servers, files, or printers. A separate guest network keeps them connected to the internet without any risk to your business data.',
    business_impact: 'Unsegmented guest access allows any visitor or personal device to reach internal servers, file shares, and printers — creating an uncontrolled access path to sensitive business data.',
    technical_rationale: 'CIS Control 12.2 requires network segmentation with separate wireless networks for guest access. Guest traffic must be isolated to a dedicated VLAN with no routing to corporate resources.',
  },
  'b9dd4013-e67c-48a3-8c3c-9a8cf0b9fddb': {
    // Switch firmware current and not EOL
    how_to_find: 'Check Auvik for switch firmware versions. Log into switch management interface to verify current firmware. Compare against vendor release notes for the latest stable version. Check vendor EOL announcements for the switch model.',
    why_we_ask: 'Like any network device, switches need firmware updates to fix bugs and security vulnerabilities. End-of-life switches stop receiving these updates and become a permanent weak point in your network.',
    business_impact: 'Outdated switch firmware with known vulnerabilities can be exploited for VLAN hopping, traffic interception, or denial-of-service attacks within the local network.',
    technical_rationale: 'CIS Control 2.2 requires vendor-supported, current firmware on all network infrastructure. Switch vulnerabilities can bypass network segmentation controls.',
  },
  '6c639e89-385d-4a7a-859d-bd0c1ffe72fc': {
    // VLANs deployed for network segmentation
    how_to_find: 'Review Auvik network topology for VLAN configuration. Log into the core switch and review VLAN assignments. Verify at minimum: corporate data, guest, VoIP, and server VLANs are separated. Check firewall inter-VLAN routing rules.',
    why_we_ask: 'Network segmentation divides your network into isolated zones so that a problem in one area cannot spread to another. If ransomware hits a guest device, it stays contained instead of reaching your servers.',
    business_impact: 'Without VLANs, a single compromised device can access every other device on the network. Flat networks dramatically increase the blast radius of any security incident.',
    technical_rationale: 'CIS Control 12.2 mandates network segmentation. VLANs reduce the attack surface, limit lateral movement, and are a core requirement for PCI-DSS, HIPAA, and zero-trust architectures.',
  },
  '6a7ee7fb-ca50-41ce-897d-a850cfd33b23': {
    // Wireless secured with WPA2/WPA3 enterprise encryption
    how_to_find: 'Check the wireless controller or AP configuration for authentication mode on corporate SSIDs. Verify WPA2-Enterprise or WPA3-Enterprise with RADIUS authentication is configured (not PSK). In Auvik, check wireless network details. Review IT Glue for documented wireless standards.',
    why_we_ask: 'Enterprise Wi-Fi encryption uses individual user credentials instead of a shared password. This means when an employee leaves, their access is automatically revoked — no need to change the Wi-Fi password for everyone.',
    business_impact: 'Shared PSK wireless credentials cannot be revoked per-user, meaning former employees retain network access until the password is changed for everyone — a significant security and compliance gap.',
    technical_rationale: 'CIS Control 12.6 requires WPA2/WPA3-Enterprise with 802.1X authentication. PSK-based authentication provides no individual accountability and violates the principle of unique credential assignment.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK INFRASTRUCTURE — Connectivity & Monitoring
  // ═══════════════════════════════════════════════════════════════
  '688faba3-b96f-46e6-81c4-b0d1e1448f22': {
    // Network diagram current and documented (IT Glue)
    how_to_find: 'Check IT Glue under the client organization > Documents or Diagrams for a current network diagram. Auvik auto-generates network topology maps that can serve as a baseline. Verify the diagram includes VLANs, IP ranges, firewall, switches, APs, and WAN connections.',
    why_we_ask: 'A current network diagram is essential for troubleshooting, onboarding new technicians, and planning changes. Without one, even simple network issues take longer to diagnose and resolve.',
    business_impact: 'Missing network documentation increases troubleshooting time during outages and creates risk during changes, as engineers must discover the network layout under pressure instead of referencing documentation.',
    technical_rationale: 'CIS Control 12.4 and NIST SP 800-53 CM-2 require documented network architecture. Accurate diagrams are essential for incident response, change management, and compliance audits.',
  },
  '43c68558-3cbc-403e-9cf1-3bf75285d530': {
    // Network monitoring active (Auvik or equivalent)
    how_to_find: 'Verify the client is active in Auvik with a collector deployed and devices discovered. Check that SNMP is configured on network devices for full monitoring coverage. Review Auvik alerts configuration and confirm integration with Autotask PSA for ticket creation.',
    why_we_ask: 'Network monitoring lets us detect and often fix problems before your team even notices them. Without it, we only find out about network issues when someone calls to report slow internet or an outage.',
    business_impact: 'Without proactive network monitoring, outages and performance degradation are only detected when users report them — increasing downtime and response time for every network issue.',
    technical_rationale: 'CIS Control 12.4 requires monitoring of network infrastructure. Real-time monitoring enables proactive alerting on device failures, bandwidth saturation, and configuration changes.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  IDENTITY & ACCESS — Identity Platform
  // ═══════════════════════════════════════════════════════════════
  '72993aab-5ee0-4b7d-a1d0-b711424a2b93': {
    // All user accounts authenticated through centralized identity
    how_to_find: 'Review Entra ID or Google Workspace user list and compare against the client employee roster in Autotask. Check for shadow accounts — local-only accounts on endpoints, standalone app accounts not federated to the IdP. SaaS Alerts can identify accounts not tied to the IdP.',
    why_we_ask: 'Centralized identity means one place to manage who has access to what. When someone leaves, disabling one account revokes access everywhere — no hunting through dozens of separate systems.',
    business_impact: 'Decentralized accounts mean terminated employees may retain access to individual applications indefinitely, creating significant data exfiltration and unauthorized access risk.',
    technical_rationale: 'CIS Control 5.1 requires centralized identity management. NIST SP 800-63 recommends federated identity for consistent authentication, access control, and audit logging across all applications.',
  },
  'f22698cb-f99e-4013-b310-b135a3a099b7': {
    // Centralized identity platform deployed (Entra ID or Google Workspace)
    how_to_find: 'Check the Microsoft 365 admin center or Google Workspace admin console for the client tenant. Verify Entra ID (Azure AD) or Google Workspace is the authoritative identity source. Review IT Glue for the documented identity architecture.',
    why_we_ask: 'A centralized identity platform is the foundation of modern IT security. It provides single sign-on, multi-factor authentication, and centralized control over every user account and application in your organization.',
    business_impact: 'Without a centralized identity platform, user management is fragmented across multiple systems, making it impossible to enforce consistent security policies, MFA, or timely access revocation.',
    technical_rationale: 'Centralized identity (IdP) is the prerequisite for SSO, conditional access, and zero-trust architecture. CIS Control 5 and NIST SP 800-53 IA-2 require centralized authentication and access management.',
  },
  'ef0e7dff-66d0-43a3-9366-92b90bc9721f': {
    // Hybrid AD sync configured and healthy (if applicable)
    how_to_find: 'Check Entra ID Connect (Azure AD Connect) sync status in the Entra admin center > Hybrid Management. Verify the last sync was within the last 30 minutes. Check the on-premises AD Connect server health in Datto RMM. Review event logs for sync errors.',
    why_we_ask: 'If you have on-premises Active Directory synchronized with Microsoft 365, the sync service must be healthy. A broken sync means password changes, new users, and group updates do not flow between systems — causing login issues and access problems.',
    business_impact: 'A failed AD sync causes password mismatches, delayed user provisioning, and group membership inconsistencies — leading to widespread login failures and access disruptions.',
    technical_rationale: 'Hybrid identity sync must maintain a consistent directory state between on-premises AD and Entra ID. NIST SP 800-63 requires consistent credential management across all authentication boundaries.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  IDENTITY & ACCESS — MFA & Conditional Access
  // ═══════════════════════════════════════════════════════════════
  '8c26f0e6-caa4-475b-b98d-1da3a1c1e88c': {
    // Conditional access policies configured (Entra ID)
    how_to_find: 'Navigate to Entra ID > Security > Conditional Access. Review configured policies for scope, conditions, and grant controls. Verify policies cover: require MFA, block legacy auth, require compliant device, and restrict sign-in by location. Check for report-only vs. enforced status.',
    why_we_ask: 'Conditional access adds intelligent rules to your login process — like requiring extra verification when someone logs in from an unusual location or an unmanaged device. It is how we enforce security without frustrating your team.',
    business_impact: 'Without conditional access, all logins are treated equally regardless of risk level. This means a compromised credential from a foreign IP is granted the same access as a user at their desk.',
    technical_rationale: 'Conditional access is the cornerstone of zero-trust architecture per NIST SP 800-207. It enables risk-based authentication decisions and is a Level 2 CIS recommendation for Entra ID environments.',
  },
  'dcb76a7a-b60a-480c-b193-0aa1f998b750': {
    // MFA enforced on all administrator accounts
    how_to_find: 'In Entra ID, check per-user MFA settings and conditional access policies targeting admin roles. Review the Microsoft 365 admin center > Active users and filter by admin roles. Verify MFA registration for all Global Admin, Exchange Admin, Security Admin, and SharePoint Admin accounts.',
    why_we_ask: 'Administrator accounts have the highest level of access to your systems. If an attacker compromises an admin password without MFA, they gain complete control — they can delete data, create backdoors, and disable all security protections.',
    business_impact: 'A compromised admin account without MFA gives attackers unrestricted access to the entire Microsoft 365 environment, including the ability to exfiltrate all data, delete backups, and create persistent backdoors.',
    technical_rationale: 'CIS Control 6.5 mandates MFA for all administrative access. Microsoft Security Baseline and every major framework (NIST, HIPAA, PCI-DSS, CMMC) require MFA on privileged accounts as a non-negotiable control.',
  },
  'e54568da-aded-4782-958c-c99929ffd193': {
    // MFA enforced on all user accounts
    how_to_find: 'In Entra ID, review per-user MFA status or conditional access policies that require MFA for all users. Check the MFA registration report to identify users who have not enrolled. SaaS Alerts can flag M365 accounts without MFA. This can be checked via the Microsoft Graph API.',
    why_we_ask: 'Multi-factor authentication stops over 99% of account compromise attacks. Even if someone steals or guesses a password, they cannot get in without the second factor — it is the single most effective security measure available.',
    business_impact: 'Accounts without MFA are vulnerable to credential stuffing, phishing, and brute-force attacks. Over 80% of breaches involve compromised credentials, and MFA blocks the vast majority of these attacks.',
    technical_rationale: 'CIS Control 6.3 requires MFA for all user accounts accessing enterprise resources. CISA identifies MFA as the number one recommended action for all organizations regardless of size.',
  },
  'd74dfe4a-d7b2-4924-9069-d72deb86507f': {
    // MFA enforced on backup system access
    how_to_find: 'Review the backup console (Veeam, Datto BCDR, Unitrends) login settings for MFA enforcement. Check if the backup portal supports and has MFA enabled for all admin users. Verify that cloud backup portals (Backblaze, Wasabi, Datto Cloud) require MFA.',
    why_we_ask: 'Backup systems are the last line of defense in a ransomware attack. If an attacker can access your backups, they can delete them before deploying ransomware — leaving you with no way to recover without paying.',
    business_impact: 'Compromised backup credentials allow attackers to delete or encrypt all backups before deploying ransomware, eliminating the primary recovery option and dramatically increasing the impact of an attack.',
    technical_rationale: 'NIST SP 800-53 CP-9 requires protection of backup integrity. MFA on backup access is a critical ransomware resilience control that prevents backup destruction during an active attack.',
  },
  '13838ab8-3c34-43a8-a19b-59e92c5a39ca': {
    // MFA enforced on remote/VPN access
    how_to_find: 'Check the VPN configuration on the client firewall for MFA integration (RADIUS, SAML, or vendor-specific MFA). Review Entra ID conditional access for VPN app registrations. Verify that the remote access solution (firewall VPN, RD Gateway) requires a second factor.',
    why_we_ask: 'Remote access is the front door to your network from the internet. Without MFA, a stolen VPN password gives an attacker the same access your remote employees have — full access to internal systems from anywhere in the world.',
    business_impact: 'VPN credentials without MFA are a primary target for attackers. Compromised VPN access provides an unrestricted path from the internet directly into the corporate network.',
    technical_rationale: 'CIS Control 6.5 and NIST SP 800-53 IA-2 require MFA for all remote access. VPN brute-force and credential stuffing attacks are among the most common initial access vectors in breach reports.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  IDENTITY & ACCESS — Privileged Access & Account Management
  // ═══════════════════════════════════════════════════════════════
  '2e1d4be0-8a64-41cc-940c-f02cf86a8313': {
    // Admin accounts separated from daily-use accounts
    how_to_find: 'In Entra ID, review users with assigned admin roles. Check if those users also use the same account for daily email and Teams. Best practice is separate admin accounts (e.g., admin.jsmith@domain.com) not used for email. Review IT Glue for the documented admin account standard.',
    why_we_ask: 'If an administrator uses the same account for email and system administration, a single phishing attack could give an attacker full admin access. Separate accounts mean a compromised inbox does not equal a compromised network.',
    business_impact: 'When admin and daily-use accounts are combined, phishing attacks against that user grant immediate elevated privileges — dramatically increasing the blast radius of a credential compromise.',
    technical_rationale: 'CIS Control 5.4 requires separate accounts for administrative and daily activities. NIST SP 800-53 AC-6(2) mandates use of non-privileged accounts for non-security functions.',
  },
  '87242958-6d2b-4bf8-8bd6-8227d1b427d6': {
    // Dormant/inactive accounts disabled within 45 days
    how_to_find: 'In Entra ID, review the Sign-in activity report and filter for accounts with no sign-in activity in 45+ days. Check for shared/service accounts that may appear dormant but are intentionally active. SaaS Alerts can flag inactive user accounts across M365 and connected SaaS apps.',
    why_we_ask: 'Inactive accounts are a hidden attack surface. Former employees, contractors, or unused service accounts that remain active provide a way in that nobody is watching. Disabling them promptly reduces your exposure.',
    business_impact: 'Dormant accounts are frequently targeted in attacks because nobody monitors their activity. A compromised dormant account can go undetected for months, enabling prolonged unauthorized access.',
    technical_rationale: 'CIS Control 5.3 requires disabling dormant accounts after 45 days of inactivity. NIST SP 800-53 AC-2 mandates automated account management including timely disablement of inactive accounts.',
  },
  '2adc752a-2c9c-4ded-8d85-8a2a2b11b443': {
    // Password policy enforced (complexity + length requirements)
    how_to_find: 'In Entra ID, check Authentication methods > Password protection for banned password lists and custom settings. Review the tenant password policy for minimum length (14+ characters recommended) and complexity. For on-prem AD, check Group Policy > Default Domain Policy > Password Policy.',
    why_we_ask: 'Weak passwords are easy to guess or crack. A strong password policy ensures your team uses passwords that resist brute-force attacks. Combined with MFA, this makes account compromise extremely difficult.',
    business_impact: 'Weak password policies allow easily guessable credentials that can be cracked in minutes using automated tools, making every user account a potential entry point for attackers.',
    technical_rationale: 'NIST SP 800-63B recommends minimum 14-character passwords with banned password lists over traditional complexity rules. CIS Control 5.2 requires organization-defined password policies enforced technically.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  IDENTITY & ACCESS — User Lifecycle
  // ═══════════════════════════════════════════════════════════════
  'd1d9d33a-7da1-4d2b-97a1-afb0a4334718': {
    // Access reviews conducted at least semi-annually
    how_to_find: 'Check IT Glue for documented access review records. Review Entra ID Access Reviews if configured. Ask the TAM for the last access review date. Check Autotask for recurring tickets related to access reviews. Look for review documentation of admin roles, shared mailboxes, and group memberships.',
    why_we_ask: 'Over time, people accumulate access they no longer need — shared drives, applications, admin roles. Regular access reviews clean up these permissions and ensure everyone has only what they need to do their job.',
    business_impact: 'Without regular access reviews, permission creep creates excessive access rights that increase insider threat risk and violate the principle of least privilege — a common compliance audit finding.',
    technical_rationale: 'CIS Control 5.1 and NIST SP 800-53 AC-2 require periodic access reviews. Semi-annual reviews are the minimum frequency accepted by most compliance frameworks including SOC 2 and HIPAA.',
  },
  '02ad789b-c15e-436e-8c6d-29ca2f746805': {
    // New user onboarding procedure documented and followed
    how_to_find: 'Check IT Glue for a documented onboarding procedure or checklist. Review Autotask for onboarding ticket templates or workflows. Ask the TAM if a standard onboarding process is followed consistently. Verify the procedure covers account creation, licensing, device setup, and security enrollment.',
    why_we_ask: 'A consistent onboarding process ensures every new employee starts with the right access, security tools, and training from day one. Without it, new hires may be over-provisioned or miss critical security steps.',
    business_impact: 'Inconsistent onboarding leads to over-provisioned access, missing security tools, unenrolled MFA, and incomplete training — creating security gaps from the employee first day.',
    technical_rationale: 'NIST SP 800-53 AC-2 requires documented procedures for account provisioning. Standardized onboarding ensures consistent security control deployment across all new user accounts.',
  },
  '6a3f0963-0f58-4925-9166-1d86cd2e5204': {
    // User offboarding/termination procedure documented and followed
    how_to_find: 'Check IT Glue for a documented offboarding checklist. Review Autotask for offboarding ticket templates. Verify the procedure covers: account disablement, license recovery, device collection, data preservation, MFA removal, and shared resource reassignment. Check recent terminations for procedural compliance.',
    why_we_ask: 'When an employee leaves, their access must be revoked immediately and completely. A documented offboarding process ensures nothing is missed — no lingering email access, no active VPN credentials, no forgotten admin accounts.',
    business_impact: 'Incomplete offboarding is a leading cause of data exfiltration by former employees. Retained access enables unauthorized data access, competitive harm, and potential regulatory violations.',
    technical_rationale: 'CIS Control 5.3 and NIST SP 800-53 AC-2 require timely revocation of access upon termination. Offboarding failures are among the most common findings in SOC 2 and HIPAA audits.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — Email Security
  // ═══════════════════════════════════════════════════════════════
  '58f42d35-3868-4761-af7b-57db8d15fe92': {
    // Advanced email filtering active (Inky / Defender for Office 365)
    how_to_find: 'Check the Microsoft 365 admin center for Defender for Office 365 licensing and policy configuration. If using a third-party solution (Inky, Proofpoint, Mimecast), verify the MX records point to the filtering service. Review SaaS Alerts for email threat telemetry.',
    why_we_ask: 'Email is the number one way attackers target businesses — phishing, business email compromise, and malware attachments. Advanced email filtering catches the sophisticated attacks that basic spam filtering misses.',
    business_impact: 'Without advanced email filtering, sophisticated phishing and BEC attacks reach user inboxes at higher rates. Business email compromise alone costs organizations billions annually and is the leading cause of financial fraud.',
    technical_rationale: 'CIS Control 9.7 requires advanced email protections including attachment sandboxing, link rewriting, and impersonation detection. Basic EOP filtering is insufficient against modern targeted attacks.',
  },
  'bf45eb85-be10-446a-8caa-0ff1ba0a1e7e': {
    // DKIM configured and active
    how_to_find: 'Check the Microsoft 365 admin center > Settings > Domains > DNS records for DKIM configuration. Use an online DKIM validator tool or run a DNS lookup for selector1._domainkey and selector2._domainkey CNAME records. This can be automated via DNS query APIs.',
    why_we_ask: 'DKIM is an email authentication standard that digitally signs your outbound emails to prove they actually came from your domain. Without it, attackers can more easily send fake emails that appear to come from your company.',
    business_impact: 'Without DKIM, your domain is more susceptible to email spoofing, which can be used for phishing attacks against your clients, partners, and employees — damaging trust and enabling fraud.',
    technical_rationale: 'DKIM is a core component of email authentication alongside SPF and DMARC per NIST SP 800-177. It provides cryptographic verification of email origin and message integrity.',
  },
  'a50bde2d-9e1a-472a-a408-7cf729cd403b': {
    // DMARC policy configured (minimum p=quarantine)
    how_to_find: 'Run a DNS TXT lookup for _dmarc.clientdomain.com. Verify a DMARC record exists with at minimum p=quarantine (ideally p=reject). Check the rua/ruf reporting addresses are configured and monitored. This can be automated via DNS query scripts.',
    why_we_ask: 'DMARC tells receiving mail servers what to do with emails that fail authentication — quarantine or reject them. Without a DMARC policy, spoofed emails using your domain will be delivered to recipients without any warning.',
    business_impact: 'Without DMARC enforcement, attackers can freely impersonate your email domain to send phishing emails to your clients, partners, and vendors — damaging your reputation and enabling fraud in your name.',
    technical_rationale: 'DMARC at p=quarantine or p=reject is required by CIS Control 9.5, NIST SP 800-177, and BOD 18-01 (for federal agencies). It is the enforcement mechanism that makes SPF and DKIM actionable.',
  },
  '40b31539-352d-4ff3-b0ec-7f6eedf6804a': {
    // External email tagging / banner enabled
    how_to_find: 'Check Exchange Online mail flow rules (Transport Rules) for a rule that prepends an "[EXTERNAL]" tag or inserts an HTML banner on inbound messages from outside the organization. Review the Microsoft 365 Exchange admin center > Mail flow > Rules.',
    why_we_ask: 'External email tags alert your team when a message comes from outside your organization. This simple visual cue helps employees spot phishing and impersonation attempts — especially when the attacker pretends to be a coworker or your CEO.',
    business_impact: 'Without external email tagging, employees cannot easily distinguish internal emails from spoofed external ones, increasing susceptibility to business email compromise and CEO fraud attacks.',
    technical_rationale: 'External email tagging is a low-cost, high-value anti-phishing control recommended by CISA and Microsoft security baselines. It provides a consistent visual indicator that aids user decision-making.',
  },
  'cb40a003-b2ee-416e-adce-d503cd5d33f8': {
    // SPF record configured correctly
    how_to_find: 'Run a DNS TXT lookup for the client primary domain and check for an SPF record. Verify it includes all legitimate sending sources (Microsoft 365, any third-party email services) and ends with -all (hard fail) rather than ~all (soft fail). Validate with an online SPF checker tool.',
    why_we_ask: 'SPF tells email servers which systems are authorized to send email on behalf of your domain. Without it, spammers and attackers can send emails that look like they come from your company address.',
    business_impact: 'A missing or misconfigured SPF record allows unauthorized email sources to send as your domain, enabling phishing and spam campaigns that damage your domain reputation and email deliverability.',
    technical_rationale: 'SPF is the first layer of email authentication defined in RFC 7208. CIS Control 9.5 and NIST SP 800-177 require SPF configuration. Incorrect SPF can also cause legitimate email delivery failures.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — DNS & Web Security
  // ═══════════════════════════════════════════════════════════════
  '82fb3b2e-f934-498b-b123-5e1144c894d2': {
    // DNS filtering active on all endpoints (Umbrella / firewall WCF)
    how_to_find: 'Check if endpoints are configured to use a DNS filtering service (Cisco Umbrella, DNSFilter, or firewall-based DNS filtering). In Datto RMM, audit the DNS server settings on endpoints. Verify the DNS filtering dashboard shows the client endpoints reporting. This can be automated via RMM scripts.',
    why_we_ask: 'DNS filtering blocks malicious websites at the network level — before your browser even connects. If an employee clicks a phishing link, DNS filtering can prevent the connection to the attacker server entirely.',
    business_impact: 'Without DNS filtering, employees can reach known malicious domains, phishing sites, and command-and-control servers. This removes a critical layer of defense that operates before any endpoint protection engages.',
    technical_rationale: 'CIS Control 9.2 requires DNS filtering to block connections to known malicious domains. DNS-layer security provides protection that works regardless of protocol and cannot be bypassed by HTTPS encryption.',
  },
  'aaf1028d-8385-4cc8-b56e-a5766fa81c17': {
    // DNS filtering policies configured to block malicious categories
    how_to_find: 'Log into the DNS filtering console (Umbrella, DNSFilter, or firewall WCF settings). Review the active policy and verify that malware, phishing, botnet, cryptomining, and newly-registered domain categories are blocked. Check for any overly permissive exceptions.',
    why_we_ask: 'Having DNS filtering installed is not enough — the policies must be configured to block the right categories. We ensure malware, phishing, and other high-risk categories are blocked while keeping your team productive.',
    business_impact: 'Permissive DNS filtering policies that do not block malicious categories provide a false sense of security while leaving critical threat categories accessible to users and malware.',
    technical_rationale: 'NIST SP 800-53 SC-7 requires boundary protections including content filtering. DNS policies must block at minimum: malware, phishing, botnets, C2 domains, and newly-registered domains (commonly used in attacks).',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — SIEM & SOC Monitoring
  // ═══════════════════════════════════════════════════════════════
  '573f52f6-b296-4c1a-960d-b1d2e9394a02': {
    // 24x7 SOC monitoring active with alerting
    how_to_find: 'Verify the client has an active SOC/MDR subscription (RocketCyber, Blumira, Huntress, etc.) with 24x7 monitoring enabled. Check the SOC console for the client tenant status. Confirm alerting is configured to notify the MSP via Autotask PSA tickets or email.',
    why_we_ask: 'Cyberattacks do not follow business hours. 24x7 SOC monitoring means trained security analysts are watching for threats around the clock and can respond immediately — whether it is 2 PM or 2 AM.',
    business_impact: 'Without 24x7 monitoring, after-hours attacks go undetected until the next business day, giving attackers an extended window to exfiltrate data, deploy ransomware, or establish persistent access.',
    technical_rationale: 'NIST SP 800-53 SI-4 requires continuous monitoring. CIS Control 8 mandates centralized log collection and analysis. 24x7 SOC coverage is increasingly required by cyber insurance carriers.',
  },
  '16df22b1-66fc-4dae-b400-6ac9584649a4': {
    // Critical log sources forwarding to SIEM
    how_to_find: 'Review the SIEM/MDR console for configured log sources. Verify at minimum: M365 audit logs, Entra ID sign-in logs, firewall logs, endpoint EDR telemetry, and VPN authentication logs are forwarding. Check for any log source gaps or ingestion errors.',
    why_we_ask: 'Security monitoring is only effective if it can see what is happening. Forwarding logs from your key systems — email, identity, firewall, endpoints — gives the SOC complete visibility to detect and investigate threats.',
    business_impact: 'Missing log sources create blind spots in security monitoring. If firewall or identity logs are not forwarded, attacks involving those systems will not generate SOC alerts, leaving threats undetected.',
    technical_rationale: 'CIS Control 8.2 requires centralized collection of critical log sources. NIST SP 800-92 defines log management requirements. Compliance frameworks (PCI-DSS 10.2, HIPAA) require specific log source collection.',
  },
  '98308982-3651-4a23-872f-74d0ec5b5df1': {
    // SIEM/MDR platform active (RocketCyber / Blumira)
    how_to_find: 'Verify the client has an active SIEM or MDR platform subscription. Check the platform console for agent deployment status and data ingestion. Review Autotask for the associated contract/service item. Confirm the platform is receiving data and generating alerts.',
    why_we_ask: 'A SIEM or MDR platform collects security data from across your environment and uses it to detect threats that no single tool can catch on its own. It is the central nervous system of your security monitoring.',
    business_impact: 'Without a SIEM/MDR platform, security events from different tools are siloed and uncoordinated. Sophisticated attacks that span multiple systems (email + identity + endpoint) go undetected.',
    technical_rationale: 'CIS Control 8 requires audit log management and centralized analysis. A SIEM/MDR platform provides the correlation, detection rules, and response capabilities mandated by NIST SP 800-53 SI-4 and AU-6.',
  },
  '72e77269-6523-4019-a08c-19865e2e7cc8': {
    // SOC alerts integrated into PSA ticketing
    how_to_find: 'Check the SIEM/MDR platform for PSA integration configuration. Verify that SOC alerts create tickets in Autotask automatically. Review recent Autotask tickets for SOC-generated alerts to confirm the integration is working and tickets are being triaged.',
    why_we_ask: 'When a security alert fires, it needs to be tracked and resolved like any other service issue. Integrating SOC alerts into our ticketing system ensures nothing falls through the cracks and every alert gets a response.',
    business_impact: 'SOC alerts that only go to email or a separate portal risk being missed or delayed. Without PSA integration, critical security alerts may not be triaged or responded to within required timeframes.',
    technical_rationale: 'ITIL incident management requires all security events to be tracked through the service management system. PSA integration ensures SLA-bound response times and creates an audit trail for compliance.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — Vulnerability Management
  // ═══════════════════════════════════════════════════════════════
  'a07177a7-bde9-428b-aeb3-0b537906f254': {
    // Patch compliance >= 90% within 30 days (third-party apps)
    how_to_find: 'Check Datto RMM patch management reports for third-party application compliance rates. Review any dedicated patch management tool (Patch My PC, Chocolatey, Ninite Pro) for deployment success rates. Filter for patches older than 30 days that remain unapplied.',
    why_we_ask: 'Third-party applications like browsers, PDF readers, and Java are frequently targeted by attackers. Maintaining 90% or better patch compliance ensures the vast majority of known vulnerabilities are closed promptly.',
    business_impact: 'Low third-party patch compliance leaves known vulnerabilities open across the fleet. Attackers routinely exploit outdated browsers, Adobe products, and other common applications as initial access vectors.',
    technical_rationale: 'CIS Control 7.4 requires timely patching of applications. A 90% compliance target within 30 days balances operational feasibility with security risk reduction for non-critical application patches.',
  },
  '88283a79-bcea-4308-b604-49b286c53a49': {
    // Patch compliance >= 95% within 30 days (OS)
    how_to_find: 'Review Datto RMM OS patch compliance dashboards. Check Windows Update or WSUS compliance reports. Filter for devices with OS patches pending more than 30 days. Identify devices that consistently fail patching and investigate root causes. This is fully automatable via RMM API.',
    why_we_ask: 'Operating system patches fix the most critical security vulnerabilities. A 95% compliance rate means nearly every device in your environment is protected against known exploits within a reasonable timeframe.',
    business_impact: 'OS patch compliance below 95% indicates systemic patching failures that leave a significant portion of the fleet vulnerable to known exploits, increasing the likelihood of successful attack.',
    technical_rationale: 'CIS Control 7.3 requires automated OS patching with defined compliance targets. A 95% threshold accounts for edge cases (offline devices, reboot-pending) while ensuring the vast majority of the fleet is current.',
  },
  '5b34c0ab-d316-479b-ac0a-e1b3d03c4378': {
    // Vulnerability scanning performed quarterly (minimum)
    how_to_find: 'Check for a vulnerability scanning tool (Nessus, Qualys, Rapid7, or built-in SIEM scanning). Review IT Glue for documented scan results and remediation records. Check Autotask for recurring vulnerability scan tickets. Ask the TAM for the last scan date and findings.',
    why_we_ask: 'Vulnerability scanning proactively identifies weaknesses in your systems before attackers find them. Quarterly scans ensure that new vulnerabilities are discovered and remediated on a regular cadence.',
    business_impact: 'Without regular vulnerability scanning, unknown weaknesses accumulate in the environment. Attackers use automated scanners continuously — without periodic scanning, defenders are operating blind.',
    technical_rationale: 'CIS Control 7.5 requires periodic vulnerability scanning. PCI-DSS Requirement 11.2 mandates quarterly internal and external scans. NIST SP 800-53 RA-5 requires vulnerability monitoring.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — Security Awareness & Training
  // ═══════════════════════════════════════════════════════════════
  '6e2d8a95-3909-40a8-a038-4882d245900f': {
    // All users enrolled in security awareness training
    how_to_find: 'Check the security awareness training platform (BullPhish, KnowBe4, Breach Secure Now) for the enrolled user count. Compare against the Autotask or Entra ID active user list. Identify any users not enrolled. This can be checked via the training platform API.',
    why_we_ask: 'Your employees are your first line of defense — and your biggest vulnerability. Security awareness training teaches them to recognize phishing emails, social engineering, and other attacks before they cause damage.',
    business_impact: 'Untrained users are significantly more likely to fall for phishing attacks, click malicious links, or share sensitive information — making the human element the most exploited attack vector.',
    technical_rationale: 'CIS Control 14 requires security awareness training for all users. NIST SP 800-50 and HIPAA (45 CFR 164.308) mandate security training. Cyber insurance applications require evidence of enrolled training programs.',
  },
  '835fb1dc-b919-4f6e-a701-01a173324e3b': {
    // Phishing simulation campaigns running (monthly minimum)
    how_to_find: 'Check the security awareness training platform for phishing simulation campaign history. Verify campaigns are running at least monthly. Review click rates, report rates, and repeat offenders. Check Autotask for recurring phishing simulation tickets.',
    why_we_ask: 'Phishing simulations are like fire drills for cybersecurity. Regular tests keep your team sharp, identify employees who need extra training, and measure how well your organization detects real attacks.',
    business_impact: 'Without regular phishing simulations, there is no way to measure or improve employee resilience against the most common attack vector. Organizations that simulate see up to 60% reduction in click rates.',
    technical_rationale: 'CIS Control 14.2 requires phishing simulation testing. Monthly campaigns provide consistent measurement of organizational phishing susceptibility and identify high-risk users for targeted training.',
  },
  '29554631-2a2d-4205-81d2-d645f1aee8fe': {
    // Security awareness training platform active (BullPhish / BSN)
    how_to_find: 'Verify the client has an active subscription to a security awareness training platform (BullPhish ID, Breach Secure Now, KnowBe4). Check the platform for the client organization status. Review Autotask for the associated contract/service item.',
    why_we_ask: 'A dedicated training platform delivers automated, consistent security education including interactive courses, quizzes, and phishing simulations. Manual training or occasional email reminders simply are not effective enough.',
    business_impact: 'Without a dedicated platform, training delivery is inconsistent, completion tracking is manual, and phishing simulations cannot be automated — resulting in a less prepared workforce.',
    technical_rationale: 'Automated security awareness platforms provide the consistent delivery, tracking, and reporting capabilities required by CIS Control 14. Manual training processes cannot achieve the required frequency or measurement.',
  },
  '2b5334ea-cc98-47d2-af32-174918fe85b8': {
    // Training completion rate >= 90%
    how_to_find: 'Check the security awareness training platform dashboard for completion rates by client. Filter for the current training cycle and identify users who have not completed required modules. This can be automated via the training platform API for ongoing tracking.',
    why_we_ask: 'Having a training platform is not enough — your team needs to actually complete the training. A 90% completion rate ensures the vast majority of employees have received current security education.',
    business_impact: 'Low training completion rates leave a significant portion of the workforce untrained and vulnerable to social engineering attacks. Incomplete training also creates compliance gaps in audit evidence.',
    technical_rationale: 'Most compliance frameworks require evidence of completed training for all users. A 90% threshold accounts for new hires and leaves while maintaining organizational security awareness baseline.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — Dark Web & Threat Intelligence
  // ═══════════════════════════════════════════════════════════════
  '4daa50dd-e2b5-4515-978a-f1b08d1b883e': {
    // Dark web monitoring active (DarkWeb ID / BSN)
    how_to_find: 'Verify the client has an active dark web monitoring subscription (DarkWeb ID, Breach Secure Now, SpyCloud). Check the monitoring console for the client domains being monitored and any recent alerts. Review Autotask for the associated service contract.',
    why_we_ask: 'When credentials from your company are found on the dark web, it means they have been stolen — probably from a data breach at another service. Dark web monitoring alerts us immediately so we can force a password reset before the credentials are used against you.',
    business_impact: 'Exposed credentials on the dark web are actively sold to and used by attackers. Without monitoring, compromised credentials may be exploited for months before discovery through an actual breach.',
    technical_rationale: 'Credential exposure monitoring is a proactive threat intelligence control aligned with CIS Control 16. Early detection of compromised credentials enables pre-emptive remediation before account takeover.',
  },
  'cf19fe6e-7616-4509-a25a-a22a829ad8fd': {
    // Domain(s) monitored for credential exposure
    how_to_find: 'Check the dark web monitoring platform for monitored domains. Verify that all client email domains (primary and aliases) are being monitored. Review recent exposure alerts and confirm they are being actioned. Cross-reference monitored domains against the client M365 verified domains.',
    why_we_ask: 'Your company email domain needs to be actively monitored for credential leaks. When a breach at a third-party service exposes your employees credentials, we need to know about it right away to prevent account compromise.',
    business_impact: 'Unmonitored domains mean credential exposures go undetected. Employees frequently reuse passwords across services, so a breach at an unrelated service can directly compromise your business accounts.',
    technical_rationale: 'CIS Control 16.13 requires monitoring for unauthorized use of credentials. Domain monitoring provides early warning of credential compromise from third-party breaches, enabling proactive password resets.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  SECURITY OPERATIONS — Incident Response
  // ═══════════════════════════════════════════════════════════════
  'f13f9949-77f8-4ff9-b125-f83465d73490': {
    // Incident response plan documented
    how_to_find: 'Check IT Glue for a documented incident response plan under the client organization. Review for key components: roles and responsibilities, communication plan, containment procedures, evidence preservation, and recovery steps. Check if the client has cyber insurance that mandates specific IR procedures.',
    why_we_ask: 'When a security incident occurs, every minute counts. A documented incident response plan ensures everyone knows exactly what to do — who to call, how to contain the threat, and how to communicate with stakeholders. Without a plan, chaos leads to worse outcomes.',
    business_impact: 'Organizations without an IR plan experience significantly longer incident containment times, higher breach costs, and greater business disruption. The average cost difference is hundreds of thousands of dollars.',
    technical_rationale: 'NIST SP 800-61 defines incident response requirements. CIS Control 17 mandates an IR plan. HIPAA, PCI-DSS, and most cyber insurance policies require a documented and tested IR plan.',
  },
  '75fe2167-bb63-4154-b4b6-1c7d4afd9012': {
    // IR plan reviewed/tested annually (tabletop or walkthrough)
    how_to_find: 'Check IT Glue or Autotask for records of IR plan reviews or tabletop exercises. Ask the TAM for the last review date. Look for documented lessons learned from any exercises. Check if the cyber insurance policy requires annual testing.',
    why_we_ask: 'A plan that has never been tested may not work when you need it most. Annual tabletop exercises walk through realistic scenarios so your team practices their roles before a real incident occurs.',
    business_impact: 'Untested IR plans frequently fail during actual incidents due to outdated contacts, changed procedures, or unforeseen gaps — resulting in delayed containment and increased damage.',
    technical_rationale: 'NIST SP 800-61 and CIS Control 17.8 require periodic testing of incident response plans. Annual tabletop exercises are the minimum frequency accepted by most compliance frameworks and insurance carriers.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BACKUP & DISASTER RECOVERY — On-Prem / BDR Backup
  // ═══════════════════════════════════════════════════════════════
  'b75e59c1-22bf-4275-bf54-8d0d8baa1bf7': {
    // Automated backup solution deployed (Veeam / Unitrends)
    how_to_find: 'Check IT Glue for documented backup infrastructure. Log into the backup console (Datto BCDR, Veeam, Unitrends) and verify the client has active agents/appliances. Review Autotask configuration items for backup appliance records. Confirm backup jobs are configured and running.',
    why_we_ask: 'An automated backup solution is your safety net against data loss from any cause — ransomware, hardware failure, accidental deletion, or natural disaster. Without reliable, automated backups, a single incident can permanently destroy your business data.',
    business_impact: 'Without automated backups, any data loss event (ransomware, hardware failure, human error) can result in permanent, unrecoverable data loss — a scenario that forces many businesses to close permanently.',
    technical_rationale: 'CIS Control 11 requires automated backup procedures. NIST SP 800-53 CP-9 mandates information system backup. Backup automation eliminates human error in the backup process and ensures consistency.',
  },
  '629a4d50-1ab8-4c9b-ad85-e43ee9635b01': {
    // Backup access secured with MFA
    how_to_find: 'Review the backup management console login settings for MFA enforcement. Check Datto partner portal, Veeam Cloud Connect, or Unitrends management console for MFA configuration. Verify cloud backup storage accounts (Backblaze, Wasabi, Azure) also require MFA.',
    why_we_ask: 'Ransomware attackers specifically target backup systems. If they can log into your backup console with a stolen password, they will delete all your backups before encrypting your data — leaving you with no way to recover.',
    business_impact: 'Backup systems without MFA are the primary target in sophisticated ransomware attacks. Attackers who gain backup access can delete all recovery points, making ransomware recovery impossible without payment.',
    technical_rationale: 'NIST SP 800-53 CP-9 requires backup system protection. Backup admin access is a high-value target that requires strong authentication per CIS Control 6.5. Most ransomware playbooks include backup credential theft.',
  },
  '8fd02005-d845-41c3-90d5-ace0533ade14': {
    // Backup encryption enabled (at rest and in transit)
    how_to_find: 'Check the backup solution settings for encryption configuration. Verify encryption is enabled for both backup data at rest (on the appliance/storage) and in transit (during replication). Review the encryption key management — ensure keys are documented in IT Glue.',
    why_we_ask: 'Backup data contains a complete copy of your business information. Encryption ensures that even if backup media is stolen or intercepted during cloud replication, the data remains unreadable without the encryption key.',
    business_impact: 'Unencrypted backups stored offsite or in the cloud expose all business data to theft. A stolen backup drive or intercepted cloud replication stream without encryption is a full data breach.',
    technical_rationale: 'NIST SP 800-53 SC-28 and SC-8 require encryption of data at rest and in transit. CIS Control 3.6 mandates encryption of sensitive data. Backup encryption is required by HIPAA, PCI-DSS, and CMMC.',
  },
  '830d779b-6016-4c61-8b7f-533d52c13273': {
    // Backup immutability enabled (ransomware protection)
    how_to_find: 'Check the backup solution for immutability features — Datto BCDR has built-in immutability, Veeam supports immutable repositories, and cloud storage can use object lock. Verify that backup retention cannot be shortened or deleted by admin accounts during the immutability window.',
    why_we_ask: 'Immutable backups cannot be modified, encrypted, or deleted — even by an administrator account. This means if ransomware attackers gain access to your backup system, they still cannot destroy your recovery copies.',
    business_impact: 'Without immutability, ransomware attackers who compromise backup admin credentials can delete all backup copies before deploying ransomware, eliminating the primary recovery path and forcing ransom payment.',
    technical_rationale: 'Immutable backups are the strongest control against ransomware backup destruction. NIST SP 800-209 recommends immutable storage for backup resilience. This is increasingly required by cyber insurance carriers.',
  },
  '5920c63a-94c3-49ff-a268-7559e21d4824': {
    // Backup running on automated schedule (nightly minimum)
    how_to_find: 'Check the backup console for job schedules. Verify all protected systems have at minimum nightly backup jobs configured. Look for any missed or skipped schedules. Datto BCDR can be checked via the partner portal for screenshot verification and backup cadence. Automated via backup API.',
    why_we_ask: 'Automated nightly backups ensure your data is never more than one business day old. If a disaster strikes, you lose at most one day of work — not weeks or months of irreplaceable data.',
    business_impact: 'Without a nightly backup schedule, the recovery point objective (RPO) is unknown and potentially weeks or months — meaning that much data would be permanently lost in a disaster.',
    technical_rationale: 'CIS Control 11.2 requires automated backup on a defined schedule. Nightly backups establish a maximum 24-hour RPO. Critical systems may require more frequent backup intervals (hourly or continuous).',
  },
  '0c907171-4f27-4241-b602-9bec3e266b3c': {
    // Backup success rate >= 95% over last 30 days
    how_to_find: 'Review the backup console dashboard for the 30-day success rate per protected system. Check for recurring failures, warnings, or partial backups. Investigate any device consistently below the 95% threshold. Datto BCDR screenshot verification provides visual confirmation of backup integrity.',
    why_we_ask: 'A backup that fails is a backup that does not exist. Monitoring the success rate over 30 days ensures your backups are consistently reliable — not just running, but actually completing successfully.',
    business_impact: 'Backup success rates below 95% indicate reliability issues that may leave critical systems unprotected at the moment a disaster strikes. An unreliable backup is nearly as dangerous as no backup.',
    technical_rationale: 'CIS Control 11.3 requires monitoring of backup completeness. A 95% success rate over 30 days ensures high confidence in backup reliability while accounting for occasional transient failures.',
  },
  '6cd371f3-fb0e-40a2-ab4a-f9f3c6b5c72f': {
    // Offsite/cloud backup replication active
    how_to_find: 'Check the backup solution for offsite replication status. For Datto BCDR, verify cloud sync is active and current in the partner portal. For Veeam, check backup copy job to cloud or offsite repository. Confirm the offsite copy is geographically separate from the primary. Automated via backup API.',
    why_we_ask: 'A backup stored only at your office is vulnerable to the same disaster — fire, flood, theft, or ransomware. Offsite replication ensures a copy of your data exists in a separate, safe location.',
    business_impact: 'Without offsite replication, a physical disaster at the primary site (fire, flood, theft) destroys both the original data and the only backup copy — resulting in total, permanent data loss.',
    technical_rationale: 'The 3-2-1 backup rule (CIS Control 11.4) requires at least one offsite copy. NIST SP 800-53 CP-6 mandates alternate storage sites. Geographic separation protects against site-level disasters.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BACKUP & DISASTER RECOVERY — M365 / Cloud Backup
  // ═══════════════════════════════════════════════════════════════
  '34cae75e-a63e-4a51-bde1-71396330345d': {
    // M365 backup covers Exchange, OneDrive, SharePoint, Teams
    how_to_find: 'Check the M365 backup solution console (Datto SaaS Protection, Veeam for M365, Spanning) for protected workloads. Verify all four workloads — Exchange Online, OneDrive, SharePoint, and Teams — are included in backup jobs. Check for any excluded users or sites.',
    why_we_ask: 'Microsoft 365 does not back up your data for you — that is a common misconception. If an employee deletes files, a hacker wipes your email, or ransomware encrypts your SharePoint, Microsoft cannot restore it. You need your own backup.',
    business_impact: 'Without comprehensive M365 backup, data loss from accidental deletion, ransomware, or malicious insider activity may be unrecoverable beyond Microsoft retention windows (typically 30-93 days).',
    technical_rationale: 'Microsoft Shared Responsibility Model places data protection responsibility on the customer. CIS Control 11 requires backup of all business-critical data including cloud-hosted workloads.',
  },
  'a5bbae59-7a9c-4697-beee-81bdb05f0293': {
    // M365 backup retention meets client requirements
    how_to_find: 'Check the M365 backup solution retention settings. Review IT Glue for the documented client retention requirements. Compare the configured retention (e.g., 1 year, 3 years, unlimited) against any compliance or business requirements. Check for industry-specific mandates.',
    why_we_ask: 'Different businesses need to keep data for different lengths of time depending on their industry and regulations. We ensure your backup keeps data long enough to meet your legal, compliance, and business needs.',
    business_impact: 'Insufficient retention means data needed for legal discovery, compliance audits, or historical reference may no longer be available when required — creating legal liability and compliance violations.',
    technical_rationale: 'Retention requirements vary by framework: HIPAA requires 6 years, SOX requires 7 years, and some legal holds are indefinite. Backup retention must be configured to meet the most stringent applicable requirement.',
  },
  'def27105-3023-42b5-b19a-f6329818412d': {
    // M365 cloud backup active (Datto SaaS Protection)
    how_to_find: 'Check the Datto SaaS Protection portal (or equivalent M365 backup solution) for the client tenant status. Verify backup is active and data is being ingested. Review the last successful backup timestamp. Cross-reference protected user count against M365 licensed users.',
    why_we_ask: 'Microsoft is responsible for keeping their service running, but you are responsible for your data. An active M365 backup ensures you can recover from accidental deletion, malicious activity, or ransomware that targets your cloud data.',
    business_impact: 'Without M365 backup, the organization relies entirely on Microsoft native retention, which does not protect against ransomware, malicious deletion, or data loss beyond the retention window.',
    technical_rationale: 'Microsoft Shared Responsibility Model explicitly excludes customer data backup. CIS M365 Benchmark recommends third-party backup. This is a top requirement in cyber insurance questionnaires.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BACKUP & DISASTER RECOVERY — Recovery Testing & DR
  // ═══════════════════════════════════════════════════════════════
  '91a64e5f-9464-447a-b755-f86a55a017ac': {
    // Backup test restore performed quarterly (minimum)
    how_to_find: 'Check IT Glue for documented test restore records. Review Autotask for recurring test restore tickets. For Datto BCDR, check screenshot verification and any local virtualization tests. Ask the TAM for the last test restore date and results.',
    why_we_ask: 'The only way to know your backups actually work is to test them. A quarterly test restore verifies that we can actually recover your data and systems — not just that the backup job says "success."',
    business_impact: 'Untested backups have an alarming failure rate during actual disaster recovery. Organizations that do not test restores regularly may discover their backups are corrupt or incomplete when they need them most.',
    technical_rationale: 'CIS Control 11.5 requires periodic backup restore testing. NIST SP 800-53 CP-4 mandates contingency plan testing. Quarterly is the minimum frequency that provides reasonable confidence in backup recoverability.',
  },
  'b431c7f7-3d1b-49f9-bf5a-30c021a0310d': {
    // Disaster recovery plan documented
    how_to_find: 'Check IT Glue for a documented DR plan under the client organization. Verify it includes: critical system inventory, RTO/RPO targets, recovery procedures, communication plan, and vendor contacts. Review the plan for completeness and currency (updated within the last 12 months).',
    why_we_ask: 'A disaster recovery plan is your roadmap for getting back to business after a major disruption — server failure, ransomware, natural disaster. Without one, recovery is improvised, slower, and more expensive.',
    business_impact: 'Organizations without a DR plan experience 2-3x longer recovery times after major incidents, with significantly higher costs and greater business disruption. Many businesses without DR plans never fully recover.',
    technical_rationale: 'NIST SP 800-34 defines contingency planning requirements. CIS Control 11.1 mandates a data recovery plan. DR planning is required by HIPAA, PCI-DSS, SOC 2, and virtually all cyber insurance policies.',
  },
  '389fcbd4-37d4-4a1d-9ae2-ed5e276d0d85': {
    // DR plan reviewed/tested annually
    how_to_find: 'Check IT Glue for DR plan review records. Review Autotask for DR test tickets or QBR notes referencing DR testing. Ask the TAM for the last DR plan review date. Check if the client cyber insurance requires annual DR testing.',
    why_we_ask: 'Your business changes over time — new systems, new applications, new employees. An annual DR plan review ensures the plan still reflects your current environment and that recovery procedures work as expected.',
    business_impact: 'An outdated DR plan may reference decommissioned systems, wrong contacts, or obsolete procedures — causing confusion and delays during an actual disaster when every minute of downtime matters.',
    technical_rationale: 'NIST SP 800-34 requires annual review and testing of contingency plans. CIS Control 11.5 mandates periodic DR plan testing. Annual reviews ensure the plan remains aligned with the current environment.',
  },
  '01fa86cc-cbb4-49c5-90b2-9444999ad0b2': {
    // RTO/RPO defined and documented per client
    how_to_find: 'Check IT Glue for documented RTO/RPO targets. Review the client DR plan or QBR notes for defined recovery objectives. Verify that backup schedules and replication align with the stated RPO. Confirm that the BDR solution can meet the documented RTO.',
    why_we_ask: 'RTO (Recovery Time Objective) is how long you can be down, and RPO (Recovery Point Objective) is how much data you can afford to lose. Defining these numbers drives every backup and DR decision we make for you.',
    business_impact: 'Without defined RTO/RPO, backup and DR solutions may be over- or under-provisioned. The business may expect 1-hour recovery when the actual capability is 24 hours — creating a dangerous expectation gap.',
    technical_rationale: 'NIST SP 800-34 and ISO 22301 require defined RTO/RPO objectives derived from business impact analysis. These objectives determine backup frequency, replication strategy, and DR infrastructure requirements.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  CLOUD & APPLICATIONS — Microsoft 365 Administration
  // ═══════════════════════════════════════════════════════════════
  '6bbd5c59-6930-4e8c-980c-d4c8922ec87e': {
    // M365 admin audit logging enabled
    how_to_find: 'In the Microsoft 365 admin center, navigate to Compliance > Audit (or Microsoft Purview). Verify audit logging is turned on. Check that the audit retention period meets requirements. For E3 licenses, default retention is 90 days; E5 provides 1 year. SaaS Alerts can verify logging status.',
    why_we_ask: 'Audit logging creates a record of every administrative action in your Microsoft 365 environment. Without it, there is no way to investigate what happened during a security incident or who made a specific change.',
    business_impact: 'Disabled audit logging means there is no forensic trail for incident investigation. If a breach occurs, determining scope, timeline, and root cause becomes nearly impossible — impacting insurance claims and legal proceedings.',
    technical_rationale: 'CIS M365 Benchmark 2.1 requires unified audit logging. NIST SP 800-53 AU-2 mandates audit event logging. Audit logs are required for compliance (HIPAA, SOX, PCI-DSS) and are the primary forensic data source.',
  },
  'ca0d199c-553d-44d2-a34e-a07bbe93b923': {
    // M365 global admin accounts limited to <= 2 and MFA-protected
    how_to_find: 'In Entra ID, navigate to Roles and administrators > Global Administrator. Count the assigned users. Verify each has MFA registered and enforced. Check for service accounts or break-glass accounts with Global Admin role. SaaS Alerts flags excess admin accounts.',
    why_we_ask: 'Global admin accounts have unlimited power over your Microsoft 365 environment. Limiting them to two accounts with MFA reduces the attack surface — fewer accounts to compromise means fewer ways in for attackers.',
    business_impact: 'Excessive global admin accounts expand the attack surface for the most powerful role in M365. Each additional admin is another potential credential compromise that grants total environment control.',
    technical_rationale: 'CIS M365 Benchmark 1.1 recommends limiting global admins to 2-4. Microsoft recommends no more than 5. Each should use MFA per CIS Control 6.5. Break-glass accounts must follow separate documented procedures.',
  },
  '4294fab8-19cd-4212-9314-7da556ec3f52': {
    // M365 licensing reviewed and optimized annually
    how_to_find: 'Check the Microsoft 365 admin center > Billing > Licenses for assigned vs. available license counts. Look for unused licenses, users with higher-tier licenses than needed, and opportunities to consolidate. Review PAX8 billing for the current license inventory and cost.',
    why_we_ask: 'Microsoft 365 licensing can get expensive and complex. An annual review ensures you are not paying for unused licenses, overpaying for features nobody uses, or missing features that would benefit your team.',
    business_impact: 'Unreviewed licensing typically results in 10-20% overspend through unused licenses, over-provisioned tiers, and missed optimization opportunities — a direct and avoidable cost to the business.',
    technical_rationale: 'ITIL financial management requires periodic license optimization. Annual reviews ensure license compliance, cost optimization, and that security features included in higher tiers are being utilized.',
  },
  '45d0d8c7-dcbb-48b2-97fe-53390b9e9b7c': {
    // M365 tenant security defaults or conditional access enabled
    how_to_find: 'In Entra ID, check Properties > Security defaults. If security defaults are disabled, verify conditional access policies are configured to provide equivalent or better protection. Check for policies covering: require MFA, block legacy auth, and protect admin accounts.',
    why_we_ask: 'Security defaults are Microsoft baseline protections that every tenant should have enabled. If you use conditional access for more granular control, those policies need to cover the same ground. Without either, your M365 tenant lacks basic security controls.',
    business_impact: 'A tenant without security defaults or conditional access lacks basic protections against common attacks like password spray, legacy authentication exploits, and admin account compromise.',
    technical_rationale: 'CIS M365 Benchmark requires either security defaults (minimum) or equivalent conditional access policies. Microsoft security defaults block 99.9% of identity attacks when enabled.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  CLOUD & APPLICATIONS — SaaS Governance
  // ═══════════════════════════════════════════════════════════════
  '62d15963-381c-4813-87ec-d3d94bb11a66': {
    // AI tool usage governed (approved tools only, no data leakage)
    how_to_find: 'Review IT Glue for a documented AI acceptable use policy. Check SaaS Alerts for unauthorized AI tool usage (ChatGPT, Copilot, Gemini uploads). Review conditional access and DLP policies for AI-related controls. Ask the TAM if the client has discussed AI governance.',
    why_we_ask: 'AI tools like ChatGPT are powerful, but employees may unknowingly paste sensitive company data, client information, or confidential documents into these tools — data that then lives on third-party servers outside your control.',
    business_impact: 'Ungoverned AI tool usage can result in confidential data, trade secrets, or regulated information being uploaded to third-party AI services — creating data leakage, compliance violations, and competitive risk.',
    technical_rationale: 'AI governance falls under CIS Control 2 (Software Inventory and Control) and data protection requirements in NIST SP 800-53 AC-4. Organizations must define approved AI tools and enforce data handling policies.',
  },
  '58c6bcd5-7ac8-437a-9323-2dcf3f326b5c': {
    // SaaS Alerts policies configured for anomaly detection
    how_to_find: 'Log into SaaS Alerts and check the client organization policies. Verify alert policies are configured for: impossible travel, mass file download, mailbox forwarding rules, admin role changes, and suspicious login patterns. Check that alert severity levels and notification channels are properly set.',
    why_we_ask: 'SaaS Alerts watches for unusual behavior in your Microsoft 365 and other cloud applications. If someone suddenly downloads thousands of files or logs in from two countries simultaneously, we are alerted immediately.',
    business_impact: 'Without SaaS anomaly detection policies, unusual cloud activity like mass data download, unauthorized forwarding rules, or suspicious sign-in patterns goes undetected until significant damage occurs.',
    technical_rationale: 'UEBA (User and Entity Behavior Analytics) is recommended by NIST SP 800-53 SI-4 for monitoring cloud environments. SaaS Alerts provides the detection layer for M365-specific threats that SIEM platforms often miss.',
  },
  '6b796a1b-e602-4416-97af-dd6101e71060': {
    // SaaS monitoring active (SaaS Alerts)
    how_to_find: 'Verify the client is active in SaaS Alerts with M365 connected. Check the SaaS Alerts dashboard for the client organization status and connected applications. Confirm alerting is configured and tickets are being created in Autotask. This can be verified via the SaaS Alerts API.',
    why_we_ask: 'SaaS monitoring provides visibility into what is happening across your cloud applications — who is logging in, what they are accessing, and whether any behavior looks suspicious. Without it, cloud activity is a blind spot.',
    business_impact: 'Without SaaS monitoring, compromised cloud accounts, unauthorized data access, and anomalous behavior go undetected. Cloud account compromise is now the fastest-growing attack vector.',
    technical_rationale: 'CIS Control 8 requires monitoring of cloud service provider audit logs. SaaS monitoring fills the visibility gap for cloud applications that traditional on-premises security tools cannot cover.',
  },
  'da7d3553-9faa-4f29-8d4e-d11913315e1e': {
    // Shadow IT / unauthorized SaaS usage monitored
    how_to_find: 'Check SaaS Alerts for connected application discovery. Review Microsoft Cloud App Security (Defender for Cloud Apps) for shadow IT reports. Check DNS filtering logs for SaaS application usage patterns. Review Entra ID enterprise application consent records for unauthorized OAuth grants.',
    why_we_ask: 'Employees often sign up for cloud applications without IT approval, using their work email. These unauthorized apps may not meet your security or compliance standards, and they create access points that nobody is monitoring or managing.',
    business_impact: 'Shadow IT applications may store sensitive data without encryption, proper access controls, or backup — creating unmanaged risk. Unauthorized OAuth grants can provide third parties with ongoing access to M365 data.',
    technical_rationale: 'CIS Control 2 requires a software inventory including SaaS applications. Shadow IT monitoring identifies unauthorized applications and OAuth grants that may violate data handling policies and create unmanaged access.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  CLOUD & APPLICATIONS — Application Management
  // ═══════════════════════════════════════════════════════════════
  '2b9945a3-e7ac-4bf7-a224-41c8d1b73647': {
    // All installed software is vendor-supported (not EOL)
    how_to_find: 'Check Datto RMM software inventory for installed applications and their versions. Cross-reference against vendor EOL/EOS announcements. ScalePad can flag end-of-life software. Common offenders: legacy Java, old Adobe products, unsupported Office versions, and deprecated browser plugins.',
    why_we_ask: 'End-of-life software stops receiving security updates, just like an unsupported operating system. Every EOL application on your network is a permanent vulnerability that cannot be patched — only replaced.',
    business_impact: 'EOL software with known unpatched vulnerabilities is actively targeted by attackers. It also creates compliance violations and may invalidate cyber insurance coverage.',
    technical_rationale: 'CIS Control 2.2 requires only vendor-supported software in production. NIST SP 800-53 SI-2 mandates flaw remediation — which is impossible for EOL software that no longer receives patches.',
  },
  'a15e1b4a-8db0-48ef-bab6-75b0e02fbb75': {
    // Password manager deployed (IT Glue MyGlue / Keeper)
    how_to_find: 'Check IT Glue for MyGlue deployment status or review Keeper/1Password admin console for licensed users. Verify the password manager is deployed to all users. Check for browser extension installation via Datto RMM. Review the client password policy for password manager requirements.',
    why_we_ask: 'People cannot remember unique, complex passwords for every application. A password manager creates and stores strong, unique passwords for everything — eliminating password reuse, which is one of the most common causes of account compromise.',
    business_impact: 'Without a password manager, employees reuse passwords across services. When any one service is breached, all accounts sharing that password are compromised — a cascading credential exposure.',
    technical_rationale: 'NIST SP 800-63B recommends password managers to enable unique, complex passwords. CIS Control 5.2 requires strong credential management. Password managers are the practical enabler for modern password policies.',
  },
  '215af98d-0b60-4580-8470-5a2e97f4aef1': {
    // Software inventory maintained and reviewed annually
    how_to_find: 'Check Datto RMM for automated software inventory collection. Review IT Glue for a documented software inventory. Compare RMM-discovered software against licensed/approved applications. ScalePad provides software lifecycle tracking. Check Autotask for annual review tickets.',
    why_we_ask: 'You need to know what software is running on your network. An annual review identifies unauthorized applications, unused licenses you are paying for, and end-of-life software that needs to be replaced.',
    business_impact: 'Without a maintained software inventory, unauthorized software, license compliance violations, and EOL applications accumulate undetected — creating both security risk and unnecessary cost.',
    technical_rationale: 'CIS Control 2.1 requires a detailed software inventory. NIST SP 800-53 CM-8 mandates information system component inventory. Annual review ensures the inventory remains accurate and actionable.',
  },
  'bb416107-c5cd-4441-8d3d-dbc75ee807b9': {
    // Unauthorized software removal process documented
    how_to_find: 'Check IT Glue for a documented software management policy that addresses unauthorized software. Review Autotask for ticket templates related to software removal. Check if application whitelisting or blocklisting is configured in Intune or Group Policy.',
    why_we_ask: 'Unauthorized software — whether installed by employees or malware — can introduce security vulnerabilities, license compliance issues, and stability problems. A documented removal process ensures these are handled consistently.',
    business_impact: 'Unauthorized software may contain vulnerabilities, backdoors, or license violations that expose the organization to security risk, legal liability, and compliance failures.',
    technical_rationale: 'CIS Control 2.5 requires an allowlisting approach to software management. NIST SP 800-53 CM-7 mandates restricting software to authorized applications. A documented process ensures consistent enforcement.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  DOCUMENTATION & OPERATIONS — IT Glue Documentation
  // ═══════════════════════════════════════════════════════════════
  'b6c32525-daaf-4ae2-9726-a83bacf0fde1': {
    // Asset inventory current and synced with RMM/PSA
    how_to_find: 'Check IT Glue configurations for the client and verify they are syncing from Datto RMM and Autotask. Look for stale configurations (devices that no longer exist). Verify sync settings in IT Glue > Settings > PSA/RMM integrations. Check Autotask configuration item counts against RMM.',
    why_we_ask: 'An accurate asset inventory tells us exactly what hardware and software you have, where it is, and who uses it. Without it, we cannot manage what we cannot see — and you may be paying for assets that no longer exist.',
    business_impact: 'Inaccurate asset inventories lead to unmanaged devices, wasted license spend, missed warranty renewals, and inability to plan hardware refresh budgets accurately.',
    technical_rationale: 'CIS Control 1 requires a complete and accurate hardware asset inventory. Automated sync between RMM, PSA, and documentation platforms eliminates manual inventory drift and ensures continuous accuracy.',
  },
  '0508a8d6-2e68-42df-b5b0-5e27270c7450': {
    // Contact/user list current and synced
    how_to_find: 'Check IT Glue contacts for the client and compare against Autotask contacts and Entra ID user list. Look for contacts who have left the company but still appear, or current employees who are missing. Verify sync configuration in IT Glue > Settings > PSA integration.',
    why_we_ask: 'An accurate contact list ensures we can reach the right people during emergencies, assign tickets correctly, and maintain proper access records. Outdated contacts cause confusion and delays when they matter most.',
    business_impact: 'Inaccurate contact lists cause tickets routed to wrong people, emergency contacts who no longer work there, and incomplete user lifecycle management — all reducing service quality and security.',
    technical_rationale: 'Accurate user directories are foundational to identity management (CIS Control 5) and incident response communications. Contact sync between PSA and documentation platforms prevents directory drift.',
  },
  'fc329021-eb87-4140-8f7d-04d97650141c': {
    // IT Glue organization active and populated
    how_to_find: 'Log into IT Glue and navigate to the client organization. Verify it is active (not archived). Check that key areas are populated: configurations, contacts, documents, passwords, network diagrams. Look for the IT Glue completeness score if available.',
    why_we_ask: 'IT Glue is the central knowledge base for your IT environment. When our team needs to troubleshoot an issue, they start here. If the documentation is incomplete or outdated, everything takes longer.',
    business_impact: 'Incomplete documentation increases mean time to resolution for every ticket, makes onboarding new technicians slower, and creates risk during emergencies when critical information is missing.',
    technical_rationale: 'Centralized IT documentation is an ITIL best practice for service management. Complete documentation reduces MTTR, enables consistent service delivery, and supports business continuity planning.',
  },
  'd3562d55-50d0-4e1c-b69a-60ace4878b35': {
    // Key procedures documented (onboarding, offboarding, DR)
    how_to_find: 'Check IT Glue documents for the client organization. Look for documented procedures covering: user onboarding, user offboarding, disaster recovery, escalation paths, and site-specific procedures. Verify procedures have been reviewed within the last 12 months.',
    why_we_ask: 'Documented procedures ensure consistency — every new hire gets the same setup, every departure follows the same security steps, and every disaster recovery follows the same playbook. Without documentation, quality depends on who is working that day.',
    business_impact: 'Undocumented procedures lead to inconsistent execution, missed security steps, and institutional knowledge locked in individual technicians who may not be available when needed.',
    technical_rationale: 'NIST SP 800-53 PS-2 and AC-2 require documented provisioning and deprovisioning procedures. ITIL service management requires runbooks for recurring processes to ensure consistent service delivery.',
  },
  'ad1c0695-63ab-497a-8f20-39e34ceadea9': {
    // Network documentation current (passwords, configs, IPs)
    how_to_find: 'Check IT Glue for documented network passwords (firewall, switches, APs, ISP credentials). Verify IP addressing documentation, VLAN assignments, and WAN circuit details. Review embedded passwords for currency. Check Auvik for auto-discovered network configuration data.',
    why_we_ask: 'Complete network documentation means any of our technicians can quickly access firewall settings, IP ranges, and credentials when troubleshooting. Without it, resolving network issues requires detective work during an outage.',
    business_impact: 'Missing network documentation extends outage resolution time from minutes to hours. During a crisis, undocumented credentials or configurations can make recovery impossible without vendor intervention.',
    technical_rationale: 'CIS Control 12.4 and NIST SP 800-53 CM-2 require documented baseline configurations. Network documentation is critical for incident response, change management, and disaster recovery.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  DOCUMENTATION & OPERATIONS — PSA & Service Management
  // ═══════════════════════════════════════════════════════════════
  'dde8d5e4-91fc-4518-8375-6a491a87df93': {
    // All managed assets tracked in Autotask with warranty dates
    how_to_find: 'Review Autotask > Configuration Items for the client. Verify all managed devices are listed with correct type, serial number, and warranty expiration date. Compare against Datto RMM device count and ScalePad warranty data. Check for CIs without warranty dates.',
    why_we_ask: 'Tracking assets in our service management platform with warranty dates allows us to proactively plan replacements, manage vendor support, and provide accurate budget forecasts for hardware refresh.',
    business_impact: 'Untracked assets lead to missed warranty claims, surprise hardware failures without coverage, and inability to generate accurate lifecycle reports for budgeting purposes.',
    technical_rationale: 'ITIL configuration management requires all managed assets in the CMDB with lifecycle attributes. Warranty tracking enables proactive refresh planning and accurate total cost of ownership calculations.',
  },
  '228c9885-c6c6-4a12-8203-f5ca0dd0d2fa': {
    // Autotask company record accurate (contacts, site info)
    how_to_find: 'Review the Autotask company record for the client. Verify: company name, address, phone, primary contact, site information, and contract details are current. Check that all active employees appear as contacts. Compare against IT Glue and the client most recent information.',
    why_we_ask: 'Accurate company records ensure tickets are created correctly, invoices go to the right address, and emergency communications reach the right people. Small data inaccuracies create big operational headaches.',
    business_impact: 'Inaccurate PSA records cause misrouted tickets, incorrect billing, failed emergency notifications, and poor reporting — all of which degrade service quality and client satisfaction.',
    technical_rationale: 'ITIL service management requires accurate CMDB and customer records as the foundation for all service delivery processes including incident, change, and financial management.',
  },
  'b0caadf7-f45e-486f-9ea0-52d6a4b50bfb': {
    // Ticket taxonomy aligned to v4 standard (issue/sub-issue)
    how_to_find: 'Review recent Autotask tickets for the client. Check that issue type and sub-issue type fields are consistently populated using the standard taxonomy. Look for tickets categorized as "General" or left blank. Review the Autotask ticket categories against the v4 standard documentation.',
    why_we_ask: 'Consistent ticket categorization helps us identify trends in your IT issues. If we can see that 40% of your tickets are printer-related, we can make a targeted improvement rather than playing whack-a-mole.',
    business_impact: 'Without consistent ticket taxonomy, trend analysis is impossible. Recurring issues cannot be identified programmatically, preventing proactive service improvement and root cause remediation.',
    technical_rationale: 'ITIL problem management requires consistent incident categorization for trend analysis and root cause identification. Standardized taxonomy enables meaningful reporting and data-driven service improvement.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  DOCUMENTATION & OPERATIONS — Lifecycle Management
  // ═══════════════════════════════════════════════════════════════
  'cc3ae749-a04b-491b-aeef-38d12dce2cdd': {
    // Hardware lifecycle plan documented and reviewed quarterly
    how_to_find: 'Check IT Glue for a documented hardware lifecycle plan. Review ScalePad Lifecycle Manager reports for device age and warranty status. Check QBR notes in Autotask for lifecycle planning discussions. Verify the plan covers endpoints, servers, network equipment, and printers.',
    why_we_ask: 'A hardware lifecycle plan replaces surprises with predictability. Instead of scrambling when a critical device fails, we plan replacements in advance — spreading costs over time and minimizing disruption.',
    business_impact: 'Without a lifecycle plan, hardware failures are always unplanned emergencies — causing extended downtime, rush procurement costs, and budget surprises that could have been avoided.',
    technical_rationale: 'IT asset lifecycle management is an ITIL best practice that reduces unplanned outages, enables accurate budgeting, and ensures hardware meets current security requirements (TPM, Secure Boot).',
  },
  '736cbe8e-e452-4c9a-a7bb-4ba97af61bad': {
    // ScalePad Lifecycle Manager active with current data
    how_to_find: 'Log into ScalePad Lifecycle Manager and verify the client is active. Check that RMM and PSA integrations are syncing and device data is current. Review the lifecycle score and identify any data gaps. Verify warranty information is being pulled from manufacturer APIs.',
    why_we_ask: 'ScalePad gives us an automated view of every device age, warranty status, and lifecycle score. This data drives our hardware refresh recommendations and helps us build accurate budgets for your IT planning.',
    business_impact: 'Without lifecycle management data, hardware refresh planning is based on guesswork rather than data — leading to either premature replacement (wasted budget) or overdue replacement (increased failure risk).',
    technical_rationale: 'Automated lifecycle management provides continuous asset intelligence that manual tracking cannot match. Integration with RMM and PSA ensures data accuracy and enables automated reporting for QBR planning.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHYSICAL & ENVIRONMENTAL — Server Room / Comms Closet
  // ═══════════════════════════════════════════════════════════════
  '0ff24c10-289d-4c90-9711-3edf635412f6': {
    // Server/network equipment in dedicated, locked space
    how_to_find: 'During an onsite visit, verify the server/network equipment location. Check for a dedicated room or locked rack with restricted key/badge access. Document the physical security controls in IT Glue site documentation. Note any concerns about shared spaces or unsecured equipment.',
    why_we_ask: 'Server and network equipment contains all your business data and controls your network. If it is in an unlocked closet or open area, anyone — employee, visitor, or cleaning crew — could tamper with it, unplug it, or steal it.',
    business_impact: 'Unsecured server equipment is vulnerable to theft, tampering, accidental damage, and unauthorized access — any of which can cause data loss, outages, or security breaches.',
    technical_rationale: 'CIS Control 1.1 and NIST SP 800-53 PE-2 require physical access controls for IT equipment. Dedicated, locked spaces are a foundational physical security control required by HIPAA, PCI-DSS, and SOC 2.',
  },
  '67a6c00c-2f1c-4c4b-9b17-21556b228e20': {
    // Server room/closet has adequate cooling
    how_to_find: 'During an onsite visit, check the server room temperature (should be 64-75F / 18-24C). Verify dedicated cooling is present (AC unit, in-row cooling). Check for temperature monitoring via UPS or environmental sensor connected to RMM. Note any signs of overheating.',
    why_we_ask: 'Server and network equipment generates significant heat. Without adequate cooling, equipment overheats — causing crashes, shortened hardware lifespan, and in extreme cases, permanent damage to your systems.',
    business_impact: 'Overheated server equipment causes unexpected shutdowns, accelerated hardware degradation, and premature failures — all leading to unplanned downtime and shortened equipment lifespan.',
    technical_rationale: 'ASHRAE recommends 64-81F (18-27C) for IT equipment. NIST SP 800-53 PE-14 requires environmental controls. Temperature monitoring and dedicated cooling are required by most data center and compliance standards.',
  },
  'd42fa91a-1733-406a-b183-00bc6c5bf8cb': {
    // UPS installed with adequate capacity for graceful shutdown
    how_to_find: 'During an onsite visit, verify UPS presence and model. Check UPS load percentage and runtime estimate. Verify the UPS is connected to critical equipment (server, firewall, switch) and configured for graceful shutdown via USB/network management card. Check Datto RMM for UPS monitoring if supported.',
    why_we_ask: 'A UPS (battery backup) keeps your servers and network running during power outages and protects against power surges. Without one, a brief power flicker can corrupt data, crash servers, and damage equipment.',
    business_impact: 'Power events without UPS protection cause immediate server crashes, potential data corruption on active databases, and hardware damage from power surges — all leading to unplanned downtime and data loss.',
    technical_rationale: 'NIST SP 800-53 PE-11 requires emergency power for IT systems. UPS capacity must support a graceful shutdown of all connected equipment. UPS monitoring should integrate with RMM for proactive battery alerts.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHYSICAL & ENVIRONMENTAL — Physical Security
  // ═══════════════════════════════════════════════════════════════
  'fa1ba184-d356-4d30-9f2c-419f7b5baec3': {
    // Physical access to IT equipment restricted to authorized personnel
    how_to_find: 'During an onsite visit, assess physical access controls: badge access, key locks, camera coverage near server room. Review the client physical security policy. Document who has access to the server room and how access is managed. Note any concerns in IT Glue.',
    why_we_ask: 'Restricting physical access to IT equipment prevents unauthorized tampering, theft, and accidental damage. If anyone can walk up to your server and plug in a USB drive, all your digital security controls can be bypassed.',
    business_impact: 'Unrestricted physical access enables theft of equipment or data, insertion of malicious devices, and accidental disruption — all of which bypass digital security controls entirely.',
    technical_rationale: 'CIS Control 1.1 and NIST SP 800-53 PE-2/PE-3 require physical access controls proportional to the sensitivity of the equipment. Physical security is a foundational control that enables all other security layers.',
  },
  'a1abab18-1593-4eb6-9f53-c2285e3f9afb': {
    // Structured cabling meets Cat 5e+ standard, documented and labeled
    how_to_find: 'During an onsite visit, inspect network cabling for category rating (Cat 5e minimum, Cat 6 preferred). Check for cable labels at patch panel and endpoint. Review IT Glue for a cabling map or diagram. Note any signs of poor cabling: exposed runs, unlabeled ports, damaged cables.',
    why_we_ask: 'Proper network cabling is the foundation of reliable connectivity. Poorly labeled or substandard cabling causes intermittent network problems that are extremely difficult to troubleshoot remotely.',
    business_impact: 'Poor cabling infrastructure causes intermittent connectivity issues, slow transfer speeds, and extended troubleshooting time for network problems — all of which reduce productivity and increase support costs.',
    technical_rationale: 'TIA/EIA-568 defines structured cabling standards. Cat 5e supports up to 1Gbps, Cat 6 supports 10Gbps. Proper labeling reduces mean time to repair for physical network issues and enables accurate documentation.',
  },
  '9855f265-ce96-46ae-94b8-cae40e8de124': {
    // UPS battery within warranty / replacement lifecycle
    how_to_find: 'Check the UPS model and battery install date. Most UPS batteries last 3-5 years. Verify the UPS self-test results and battery health indicators. Check IT Glue for documented UPS battery replacement history. Review Autotask for upcoming or overdue battery replacement tickets.',
    why_we_ask: 'A UPS with a dead battery provides zero protection during a power outage. Batteries degrade over time, so regular replacement ensures your backup power is actually there when you need it.',
    business_impact: 'A UPS with a depleted battery provides a false sense of security — when power fails, the UPS fails immediately, causing the same uncontrolled shutdown it was designed to prevent.',
    technical_rationale: 'UPS batteries typically require replacement every 3-5 years per manufacturer specifications. NIST SP 800-53 PE-11 requires maintained emergency power. Battery health monitoring should be part of regular site assessments.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  COMPLIANCE & POLICY — Core Security Policies
  // ═══════════════════════════════════════════════════════════════
  '27e44ace-47bc-477f-bea9-5517a67b5e43': {
    // Acceptable Use Policy published and acknowledged by all staff
    how_to_find: 'Check IT Glue for a documented AUP. Verify it has been distributed to all employees with signed acknowledgements. Check the security awareness training platform for AUP completion records. Ask the TAM for the last AUP distribution date and acknowledgement rate.',
    why_we_ask: 'An Acceptable Use Policy sets clear expectations for how employees should use company technology. It is both a deterrent against misuse and a legal requirement that protects your business if an employee violates the rules.',
    business_impact: 'Without a signed AUP, the organization has limited legal recourse against employee misuse of IT resources. It also creates compliance gaps for frameworks that require documented acceptable use standards.',
    technical_rationale: 'CIS Control 14.1 and NIST SP 800-53 PL-4 require an acceptable use policy. An AUP with employee acknowledgement is required by HIPAA, PCI-DSS, SOC 2, and is a standard cyber insurance requirement.',
  },
  'e5a9d634-921b-4cc8-8bca-a22927cbd3e1': {
    // Data classification and handling policy documented
    how_to_find: 'Check IT Glue for a documented data classification policy. Review whether it defines classification levels (public, internal, confidential, restricted) and handling requirements for each. Check if M365 sensitivity labels are configured to enforce the policy technically.',
    why_we_ask: 'Not all data is equally sensitive. A data classification policy defines how different types of information should be handled — ensuring client records, financial data, and employee information get the protection they require.',
    business_impact: 'Without data classification, all data is treated the same — either over-protected (reducing productivity) or under-protected (creating risk). Regulated data may be mishandled, triggering compliance violations.',
    technical_rationale: 'NIST SP 800-53 RA-2 and CIS Control 3.7 require data classification. Classification is the foundation for DLP, encryption, access control, and retention policies. Required by HIPAA, PCI-DSS, and CMMC.',
  },
  '69cf881f-c884-4e21-9a3a-4ee955d05678': {
    // Information Security Policy documented and reviewed annually
    how_to_find: 'Check IT Glue for a documented Information Security Policy. Verify it covers: access control, data protection, incident response, acceptable use, and risk management. Check the last review date — should be within 12 months. Ask the TAM if it has been reviewed at a QBR.',
    why_we_ask: 'An Information Security Policy is the overarching document that defines how your organization protects its data and systems. It is required by virtually every compliance framework and cyber insurance policy.',
    business_impact: 'A missing or outdated ISP creates compliance violations, weakens legal protection, and may invalidate cyber insurance claims. It also means there is no authoritative reference for security standards.',
    technical_rationale: 'NIST SP 800-53 PM-1 and CIS Control 15 require a documented information security policy. Annual review ensures it remains current. Required by HIPAA, PCI-DSS, SOC 2, CMMC, and cyber insurance.',
  },
  '4926a461-58d1-4be4-8206-0d0959a14f5f': {
    // Remote work / work-from-home security policy documented
    how_to_find: 'Check IT Glue for a documented remote work security policy. Verify it covers: VPN requirements, managed device use, home network security, physical workspace security, and data handling for remote workers. Check if the policy was created or updated post-pandemic.',
    why_we_ask: 'Remote work extends your network perimeter to every employee home. A documented policy ensures your team understands the security expectations — using managed devices, securing their home network, and protecting company data outside the office.',
    business_impact: 'Without a remote work policy, employees may use personal devices, unsecured networks, and unsafe data practices — creating significant data exposure risk that the organization has no documented standards to enforce.',
    technical_rationale: 'NIST SP 800-46 provides guidelines for enterprise telework. A remote work policy addresses the extended perimeter risks documented in CIS Control 12 and ensures consistent security expectations for all remote staff.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  COMPLIANCE & POLICY — Insurance & Legal
  // ═══════════════════════════════════════════════════════════════
  'fde042e6-1ca3-4a1d-8621-a89d5eb5ac39': {
    // Cyber insurance coverage reviewed annually
    how_to_find: 'Check IT Glue for documented cyber insurance policy details. Ask the TAM or client contact for the policy renewal date and coverage summary. Review whether the policy was discussed at the most recent QBR. Verify the coverage amounts match the business risk profile.',
    why_we_ask: 'Cyber insurance coverage should keep pace with your business growth and changing threat landscape. An annual review ensures your coverage limits, deductibles, and policy terms still provide adequate protection.',
    business_impact: 'Outdated coverage may have insufficient limits, excluded attack types, or unmet technical requirements that could result in a denied claim when you need it most — after a breach or ransomware event.',
    technical_rationale: 'Cyber insurance requirements evolve annually with the threat landscape. Regular review ensures technical controls meet policy requirements (MFA, EDR, backup) to maintain coverage and avoid claim denial.',
  },
  '9605f3d8-f0a3-4ee9-aee2-ba97264815ca': {
    // Cyber liability insurance active
    how_to_find: 'Ask the client for proof of active cyber liability insurance. Check IT Glue for a documented policy. Verify the policy is current (not expired). Review coverage for: breach response, ransomware, business interruption, and third-party liability.',
    why_we_ask: 'Cyber liability insurance is your financial safety net when a breach occurs. It covers breach response costs, legal fees, customer notification, regulatory fines, and business interruption — expenses that can otherwise bankrupt a small business.',
    business_impact: 'Without cyber insurance, the full cost of a breach — averaging $4.45 million — falls entirely on the business. For small businesses, an uninsured breach can be an existential event.',
    technical_rationale: 'Cyber insurance transfers residual risk after technical controls are implemented. It is a key component of a comprehensive risk management program per NIST CSF Protect function and ISO 27001 risk treatment.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  COMPLIANCE & POLICY — Compliance Readiness
  // ═══════════════════════════════════════════════════════════════
  '8c21222f-b30e-4ad0-9e33-62037602a90f': {
    // BYOD policy documented (or explicitly prohibited)
    how_to_find: 'Check IT Glue for a documented BYOD policy. Verify it clearly states whether personal devices are allowed or prohibited for accessing company data. If allowed, check for Intune MAM policies, conditional access restrictions, and data protection requirements for personal devices.',
    why_we_ask: 'Personal devices accessing company data create risk — they may not have antivirus, encryption, or screen locks. Whether you allow BYOD or prohibit it, having a documented policy ensures everyone knows the rules.',
    business_impact: 'Unmanaged personal devices accessing company data bypass all security controls. Without a BYOD policy, there is no enforceable standard for how personal devices interact with business information.',
    technical_rationale: 'NIST SP 800-124 provides mobile device security guidelines. CIS Control 1 requires control of all assets accessing enterprise resources. A BYOD policy defines acceptable use and technical controls for personal devices.',
  },
  '97e1c812-0c24-40ea-b306-61c56f9a5999': {
    // Compliance evidence collection process documented
    how_to_find: 'Check IT Glue for a documented compliance evidence collection process. Review whether automated evidence collection tools are configured. Ask the TAM if the client has undergone any compliance audits. Check for evidence repositories in IT Glue or SharePoint.',
    why_we_ask: 'When an auditor or insurance carrier asks for proof that your security controls are in place, you need to produce that evidence quickly. A documented collection process ensures evidence is gathered continuously rather than scrambled at audit time.',
    business_impact: 'Without organized evidence collection, audit preparation becomes a costly, time-consuming fire drill. Missing evidence leads to audit findings, delayed certifications, and potential compliance penalties.',
    technical_rationale: 'Compliance evidence collection supports SOC 2, HIPAA, CMMC, and PCI-DSS audit requirements. Automated, continuous evidence collection reduces audit burden and ensures evidence is available when needed.',
  },
  '6ea04b70-54f0-41ff-b39c-659cb274572e': {
    // Compliance requirements identified per client vertical
    how_to_find: 'Check IT Glue or the client profile in Align for documented compliance requirements. Review the client vertical (healthcare, finance, legal, manufacturing) and identify applicable frameworks. Ask the TAM if compliance has been discussed at QBR. Check Autotask for the client industry classification.',
    why_we_ask: 'Different industries have different compliance requirements — healthcare needs HIPAA, finance may need SOC 2, defense contractors need CMMC. Identifying your requirements ensures we build an IT environment that meets your regulatory obligations.',
    business_impact: 'Failure to identify and meet industry compliance requirements can result in regulatory fines, loss of contracts, legal liability, and reputational damage — consequences that far exceed the cost of compliance.',
    technical_rationale: 'Compliance requirement identification is the first step in any risk management program per NIST CSF Identify function. It drives the selection and configuration of all subsequent technical controls.',
  },
  '7f3a3097-f9c1-4cfb-9032-3ad332aadb25': {
    // Employee security training records maintained
    how_to_find: 'Check the security awareness training platform for completion reports and records. Verify training records are exportable and include dates, course names, and completion status. Check IT Glue for archived training records. Ask the TAM for the most recent training report.',
    why_we_ask: 'Training records prove that your employees have received required security education. During a compliance audit, insurance claim, or legal proceeding, these records are essential evidence that you took reasonable measures to train your staff.',
    business_impact: 'Missing training records cannot prove compliance with training requirements, potentially leading to audit failures, insurance claim denials, and legal exposure in the event of a breach caused by employee error.',
    technical_rationale: 'HIPAA (45 CFR 164.308), PCI-DSS, and SOC 2 require maintained training records. NIST SP 800-50 mandates documentation of security awareness activities. Records must be retained per the applicable compliance framework.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BUSINESS ALIGNMENT & GOVERNANCE — Strategic Engagement
  // ═══════════════════════════════════════════════════════════════
  '73142a04-dae8-4af7-b0a8-22fadc2ed9e0': {
    // Executive sponsor / IT decision maker identified and engaged
    how_to_find: 'Check Autotask company contacts for a designated executive sponsor or IT decision maker. Review QBR attendance records. Check IT Glue for documented escalation paths. Verify the contact is someone with authority to approve IT projects, budgets, and strategic decisions.',
    why_we_ask: 'An engaged executive sponsor ensures IT investments align with business goals. Without a clear decision-maker, recommendations stall, budgets get delayed, and strategic improvements never get implemented.',
    business_impact: 'Without an executive sponsor, IT initiatives lack the authority to move forward. This results in deferred improvements, growing technical debt, and misalignment between IT capabilities and business needs.',
    technical_rationale: 'ITIL service strategy requires business stakeholder engagement. Executive sponsorship is a key success factor for IT service management and ensures IT governance aligns with organizational objectives.',
  },
  '512b9dfe-522b-49fe-8369-05d7de69fa3e': {
    // IT budget reviewed and planned annually
    how_to_find: 'Check QBR notes in Autotask or IT Glue for budget planning discussions. Review whether a technology roadmap with associated costs has been presented. Ask the TAM if an annual IT budget was established with the client. Look for budget documents in IT Glue.',
    why_we_ask: 'An annual IT budget turns reactive spending into strategic investment. Instead of surprise costs when things break, you have a planned budget that covers maintenance, security improvements, and hardware refresh on a predictable schedule.',
    business_impact: 'Without annual IT budgeting, all IT spending is reactive and unpredictable. This leads to deferred maintenance, deferred security investments, and budget surprises that strain the business financially.',
    technical_rationale: 'IT financial management per ITIL requires annual budget planning aligned with service strategy. Budget planning enables proactive lifecycle management and ensures security investments are funded appropriately.',
  },
  '969ffd3e-28ee-4167-b687-1582df01bd12': {
    // Quarterly business review (QBR/vCIO review) conducted
    how_to_find: 'Check Autotask for recurring QBR tickets or scheduled QBR activities. Review the Align platform for assessment history. Ask the TAM for the last QBR date and next scheduled date. Check IT Glue for QBR presentation documents or notes.',
    why_we_ask: 'Quarterly business reviews are where we present your IT health scores, discuss open recommendations, plan upcoming projects, and align technology with your business goals. Skipping QBRs means strategic items never get addressed.',
    business_impact: 'Without regular QBRs, recommendations accumulate without action, security gaps persist, and IT strategy drifts from business needs — resulting in a reactive IT environment instead of a strategic one.',
    technical_rationale: 'Regular business reviews are an ITIL continual service improvement practice. QBRs provide the governance cadence needed to drive standards adoption, roadmap execution, and measurable improvement.',
  },
  'f02bc96b-2ce0-4684-9941-19009815baa2': {
    // Technology roadmap maintained and reviewed quarterly
    how_to_find: 'Check IT Glue or the Align platform for a documented technology roadmap. Review QBR materials for roadmap presentations. Ask the TAM if a roadmap exists and when it was last updated. The roadmap should cover 12-36 months of planned projects with prioritization.',
    why_we_ask: 'A technology roadmap turns your IT strategy into an actionable plan with timelines and priorities. It helps you budget for upcoming projects, ensures critical improvements are not deferred, and aligns IT investments with business growth.',
    business_impact: 'Without a roadmap, IT improvements are ad hoc and reactive. Critical projects get deferred indefinitely, security gaps persist, and the organization cannot plan financially for needed technology investments.',
    technical_rationale: 'Technology roadmap management is a core ITIL service strategy practice. Quarterly review ensures the roadmap remains aligned with changing business requirements and emerging threats.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  BUSINESS ALIGNMENT & GOVERNANCE — Service Governance
  // ═══════════════════════════════════════════════════════════════
  'd5d10c09-e4ff-4e60-b005-a7926ce93d4f': {
    // Client emergency contacts and escalation path documented
    how_to_find: 'Check IT Glue for documented emergency contacts and escalation paths. Verify Autotask company contacts include emergency/after-hours contact information. Review whether the client has a documented escalation matrix for critical issues (P1/P2).',
    why_we_ask: 'When a critical issue hits — server down, ransomware, data breach — we need to reach the right person immediately. Documented emergency contacts and escalation paths eliminate delays in crisis situations.',
    business_impact: 'Without documented emergency contacts, critical incidents face delays reaching decision-makers. During a ransomware attack or major outage, every minute of delay extends the business impact.',
    technical_rationale: 'ITIL incident management requires defined escalation procedures. NIST SP 800-61 mandates communication procedures as part of incident response. Emergency contacts must be current and accessible to on-call staff.',
  },
  '1b1ea2e9-a086-44eb-82f8-2363fa92e9a3': {
    // Client satisfaction (CSAT) measured and reviewed
    how_to_find: 'Check Customer Thermometer or the CSAT tool for recent survey results for the client. Review Autotask ticket CSAT ratings. Ask the TAM for the client current satisfaction score and any trends. Check QBR materials for CSAT discussion points.',
    why_we_ask: 'Measuring client satisfaction helps us identify issues before they become problems. Regular CSAT measurement ensures we are meeting your expectations and gives you a voice in how we deliver service.',
    business_impact: 'Without CSAT measurement, dissatisfaction goes undetected until the client relationship is at risk. Proactive measurement enables course correction before service quality issues compound.',
    technical_rationale: 'ITIL continual service improvement requires measurement of customer satisfaction. CSAT is a key performance indicator for managed service delivery and enables data-driven service improvement.',
  },
  '0a77472e-f9eb-441b-a32f-58dda0eb06a5': {
    // Open recommendations reviewed at each QBR
    how_to_find: 'Check the Align platform for open recommendations by client. Review QBR notes for recommendation review sections. Check Autotask for project tickets linked to recommendations. Ask the TAM for the current open recommendation count and aging.',
    why_we_ask: 'Open recommendations are identified improvements that have not been implemented yet. Reviewing them at every QBR ensures they do not get forgotten and keeps progress moving on the issues that matter most.',
    business_impact: 'Unreviewed recommendations accumulate and stagnate. Security improvements, efficiency gains, and cost savings remain unrealized, and the gap between current state and desired state continues to grow.',
    technical_rationale: 'Recommendation lifecycle management is part of ITIL continual service improvement. Regular review ensures accountability, tracks progress, and maintains the business case for each recommendation.',
  },
  '6a69c8f1-a987-4fb7-9ebd-20bf3579b0e0': {
    // Ticket trends reviewed monthly for recurring issues
    how_to_find: 'Review Autotask reporting for ticket volume and category trends by client. Look for recurring issue types (e.g., printer issues, password resets, VPN problems). Check if the TAM reviews monthly ticket trends. Look for problem management tickets created from trend analysis.',
    why_we_ask: 'Reviewing ticket trends reveals the root causes behind recurring problems. If the same issue keeps generating tickets, we need to fix the underlying cause rather than continuing to treat the symptoms.',
    business_impact: 'Without trend analysis, recurring issues persist indefinitely — each incident costing time and money. A problem that generates 5 tickets per month at 30 minutes each wastes 30 hours annually.',
    technical_rationale: 'ITIL problem management requires trend analysis to identify recurring incidents. Monthly review is the minimum cadence to detect patterns and initiate root cause investigation for systemic issues.',
  },

  // ═══════════════════════════════════════════════════════════════
  //  REMOTE WORK & ACCESS — Remote Access Controls
  // ═══════════════════════════════════════════════════════════════
  'a1737380-d2e7-4cf1-9328-82de49e16aea': {
    // Home network security requirements communicated (WPA2/WPA3)
    how_to_find: 'Check IT Glue for a documented remote work security guide that includes home network requirements. Review the security awareness training platform for remote worker modules. Ask the TAM if home network security standards have been communicated to remote employees.',
    why_we_ask: 'Your remote employees home network is now part of your attack surface. Ensuring they use WPA2 or WPA3 on their home Wi-Fi and follow basic security practices prevents their home network from being the weak link in your security chain.',
    business_impact: 'Employees on insecure home networks (open Wi-Fi, WEP, default router passwords) expose company traffic to interception and create a pathway for attackers to reach corporate resources through the VPN connection.',
    technical_rationale: 'NIST SP 800-46 recommends communicating security requirements for telework environments. Home network security is part of the extended perimeter that must be addressed in any remote work security strategy.',
  },
  '4a2013a1-5a35-4b43-b413-dd71fd3b3a60': {
    // Remote access secured with MFA
    how_to_find: 'Check the VPN or remote access solution for MFA integration. Review Entra ID conditional access policies for remote access applications. Verify that all remote access methods (VPN, RD Gateway, cloud apps) require MFA. Check for any bypass or exception rules.',
    why_we_ask: 'Remote access without MFA is the number one way attackers get into business networks. Adding a second factor ensures that a stolen password alone is not enough to access your systems from anywhere in the world.',
    business_impact: 'Remote access without MFA is the most common initial access vector in breaches. VPN credential compromise without MFA gives attackers the same network access as a trusted employee.',
    technical_rationale: 'CIS Control 6.5 requires MFA for all remote access. CISA identifies MFA on remote access as a critical control. Cyber insurance carriers universally require MFA on all external-facing access points.',
  },
  '51af12cf-c132-4806-829e-f7526e4c4592': {
    // Remote access via managed endpoints only
    how_to_find: 'Review Entra ID conditional access policies for device compliance requirements. Check Intune device compliance policies that restrict access to compliant/managed devices. Review SaaS Alerts for sign-ins from unmanaged or unknown devices. Check the client remote work policy.',
    why_we_ask: 'Personal devices may not have antivirus, encryption, or current patches. Restricting remote access to company-managed devices ensures every remote connection comes from a device that meets your security standards.',
    business_impact: 'Unmanaged personal devices accessing company resources bypass all endpoint security controls — no EDR, no disk encryption, no patching — creating an uncontrolled access path to business data.',
    technical_rationale: 'CIS Control 1 and NIST SP 800-46 require device management for enterprise access. Conditional access device compliance policies are the technical enforcement mechanism for managed-device-only access.',
  },
  '61bd37aa-5b00-4c81-8955-05730b0e79a9': {
    // Remote work connectivity standards met (100/100+, wired preferred)
    how_to_find: 'Ask remote employees to run speed tests and document results. Check if the client remote work policy defines minimum bandwidth requirements. Review any remote worker IT setup documentation in IT Glue. Look for recurring tickets related to poor connectivity for remote users.',
    why_we_ask: 'Slow or unreliable internet makes remote work frustrating and unproductive. Minimum bandwidth standards ensure your remote employees can use video calls, cloud applications, and VPN without constant performance problems.',
    business_impact: 'Remote workers with inadequate connectivity experience dropped video calls, slow file access, and VPN timeouts — directly reducing productivity and increasing frustration for the employee and their colleagues.',
    technical_rationale: 'Adequate bandwidth (100Mbps+ symmetric) supports modern cloud workloads, video conferencing, and VPN. Wired connections provide consistent latency required for real-time applications. This is an operational standard for remote work enablement.',
  },
}

// ── Main function ──
async function seedContent() {
  const client = await pool.connect()
  let updated = 0
  let skipped = 0

  try {
    await client.query('BEGIN')
    console.log('Transaction started — updating TAM standard content...\n')

    const ids = Object.keys(contentMap)
    for (const id of ids) {
      const c = contentMap[id]
      const result = await client.query(
        `UPDATE standards
            SET how_to_find        = $1,
                why_we_ask         = $2,
                business_impact    = $3,
                technical_rationale = $4,
                updated_at         = now()
          WHERE id = $5`,
        [c.how_to_find, c.why_we_ask, c.business_impact, c.technical_rationale, id]
      )
      if (result.rowCount > 0) {
        updated++
        if (updated % 20 === 0) console.log(`  ... updated ${updated} standards`)
      } else {
        skipped++
        console.log(`  [SKIP] No matching standard for ID ${id}`)
      }
    }

    await client.query('COMMIT')
    console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Total processed: ${ids.length}`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('ROLLBACK — error:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seedContent()
