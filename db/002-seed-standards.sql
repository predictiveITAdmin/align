-- ============================================================================
-- Seed initial standards library for predictiveIT
-- These are the baseline technology standards that TAMs assess clients against
-- ============================================================================

-- Get predictiveIT tenant ID
DO $$
DECLARE
  v_tenant_id uuid;
  v_cat_security uuid;
  v_cat_networking uuid;
  v_cat_endpoint uuid;
  v_cat_cloud uuid;
  v_cat_backup uuid;
  v_cat_email uuid;
  v_cat_server uuid;
  v_cat_compliance uuid;
  v_cat_documentation uuid;
  v_cat_enduser uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'predictiveit';

  -- Get category IDs
  SELECT id INTO v_cat_security FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Security';
  SELECT id INTO v_cat_networking FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Networking';
  SELECT id INTO v_cat_endpoint FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Endpoint Management';
  SELECT id INTO v_cat_cloud FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Cloud & SaaS';
  SELECT id INTO v_cat_backup FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Backup & DR';
  SELECT id INTO v_cat_email FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Email & Communication';
  SELECT id INTO v_cat_server FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Server & Infrastructure';
  SELECT id INTO v_cat_compliance FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Compliance';
  SELECT id INTO v_cat_documentation FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'Documentation';
  SELECT id INTO v_cat_enduser FROM standard_categories WHERE tenant_id = v_tenant_id AND name = 'End User Experience';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SECURITY
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_security, 'Firewall with Active Security Services', 'Business-class firewall with UTM, IPS/IDS, content filtering, and geo-blocking enabled', 'Active UTM subscription, firmware current within 90 days, geo-blocking enabled for non-business countries', 1),
  (v_tenant_id, v_cat_security, 'Endpoint Detection & Response (EDR)', 'EDR/MDR solution deployed on all endpoints with active monitoring', 'EDR agent on 100% of endpoints, alerts reviewed within 4 hours, auto-remediation enabled', 2),
  (v_tenant_id, v_cat_security, 'Multi-Factor Authentication (MFA)', 'MFA enforced on all cloud services, VPN, and remote access', 'MFA on M365/Google, VPN, RDP, all admin portals. No SMS-only MFA for admin accounts', 3),
  (v_tenant_id, v_cat_security, 'Privileged Access Management', 'Admin accounts are separate from daily-use accounts, PAM policies enforced', 'Dedicated admin accounts, no shared admin credentials, admin MFA enforced, JIT access where possible', 4),
  (v_tenant_id, v_cat_security, 'Security Awareness Training', 'Annual security awareness training with monthly phishing simulations', 'Training completion >90%, phishing click rate <5%, new hire training within 30 days', 5),
  (v_tenant_id, v_cat_security, 'Vulnerability Management', 'Regular vulnerability scanning with remediation SLAs', 'Monthly scans, critical vulns remediated <14 days, high <30 days, scan coverage >95%', 6),
  (v_tenant_id, v_cat_security, 'Password Policy', 'Strong password policies enforced across all systems', 'Min 14 chars, complexity required, no password reuse (10 history), lockout after 5 failed attempts', 7),
  (v_tenant_id, v_cat_security, 'Dark Web Monitoring', 'Continuous monitoring for compromised credentials on the dark web', 'Active monitoring service, alerts reviewed within 24 hours, forced password reset on detection', 8),
  (v_tenant_id, v_cat_security, 'DNS Filtering', 'DNS-level filtering blocking malicious domains and inappropriate content', 'DNS filtering on all networks and roaming devices, policy customized per client', 9),
  (v_tenant_id, v_cat_security, 'Encryption at Rest & in Transit', 'Full disk encryption on all endpoints, TLS on all services', 'BitLocker/FileVault on 100% of endpoints, recovery keys escrowed, TLS 1.2+ enforced', 10);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- NETWORKING
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_networking, 'Business-Class Switching', 'Managed switches with VLANs, QoS, and PoE where needed', 'Managed switches, VLANs segmenting voice/data/IoT/guest, firmware current', 1),
  (v_tenant_id, v_cat_networking, 'Wireless Standards', 'Enterprise-grade WiFi with WPA3, separate SSIDs for corp/guest', 'WiFi 6 or newer, WPA3-Enterprise for corp, captive portal for guest, no legacy protocols', 2),
  (v_tenant_id, v_cat_networking, 'Network Segmentation', 'Logical separation of network zones (servers, users, IoT, guest)', 'Minimum 4 VLANs, inter-VLAN ACLs, IoT devices isolated, guest network internet-only', 3),
  (v_tenant_id, v_cat_networking, 'ISP Redundancy', 'Dual ISP connections with automatic failover', 'Two independent ISPs, SD-WAN or failover configured, tested quarterly', 4),
  (v_tenant_id, v_cat_networking, 'Network Monitoring', 'Proactive monitoring of all network devices with alerting', 'SNMP/Auvik monitoring on all managed devices, alerts for down/degraded, capacity planning', 5),
  (v_tenant_id, v_cat_networking, 'UPS Protection', 'All critical network infrastructure on UPS with runtime for graceful shutdown', 'Switches, firewall, server on UPS, minimum 15 min runtime, battery tested annually', 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ENDPOINT MANAGEMENT
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_endpoint, 'Supported Operating Systems', 'All endpoints running vendor-supported OS versions', 'No Windows 10 after EOL (Oct 2025), no macOS older than current-2, no unsupported Linux distros', 1),
  (v_tenant_id, v_cat_endpoint, 'Patch Management', 'Automated patching with compliance monitoring', 'OS patches within 14 days of release, critical within 7 days, >95% compliance rate', 2),
  (v_tenant_id, v_cat_endpoint, 'Hardware Lifecycle (Under 5 Years)', 'All workstations and laptops under 5 years old with active warranty', 'No devices >5 years, warranty active on all production devices, refresh plan documented', 3),
  (v_tenant_id, v_cat_endpoint, 'Minimum Hardware Specifications', 'All endpoints meet current minimum specs for their workload', 'Minimum: SSD, 16GB RAM, i5/Ryzen 5 or better, TPM 2.0 for Windows 11', 4),
  (v_tenant_id, v_cat_endpoint, 'Remote Management Agent', 'RMM agent deployed on 100% of managed endpoints', 'Datto RMM agent installed, checking in, policies applied, no stale devices', 5),
  (v_tenant_id, v_cat_endpoint, 'Application Whitelisting', 'Policy to control which applications can be installed', 'AppLocker or equivalent policy, unapproved software blocked, exceptions documented', 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- CLOUD & SAAS
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_cloud, 'M365 Licensing Optimization', 'Appropriate M365 licensing with no unused or duplicate licenses', 'License audit quarterly, no inactive licensed users, appropriate tier per role', 1),
  (v_tenant_id, v_cat_cloud, 'Conditional Access Policies', 'Azure AD Conditional Access enforcing device compliance and location policies', 'Block legacy auth, require compliant device, block risky sign-ins, named locations configured', 2),
  (v_tenant_id, v_cat_cloud, 'Azure AD Security Defaults', 'Security defaults or equivalent CA policies enabled', 'MFA for all users, block legacy auth, require MFA for admin roles', 3),
  (v_tenant_id, v_cat_cloud, 'SaaS Application Governance', 'Inventory and governance of all cloud/SaaS applications', 'SaaS inventory documented, OAuth app consent reviewed, unused apps decommissioned', 4),
  (v_tenant_id, v_cat_cloud, 'Cloud Identity Management', 'Centralized identity with SSO for all major applications', 'Azure AD/Google Workspace as IdP, SSO for top 5 apps, automated provisioning/deprovisioning', 5);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BACKUP & DR
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_backup, 'Server/VM Backup', 'Image-based backup of all servers and VMs with offsite copy', 'Daily backup, 30-day retention minimum, offsite/cloud copy, backup verification weekly', 1),
  (v_tenant_id, v_cat_backup, 'M365/Google Workspace Backup', 'Third-party backup of all cloud mailboxes, OneDrive, SharePoint, Teams', 'Daily backup of mail/files/Teams, 1-year retention, tested restore quarterly', 2),
  (v_tenant_id, v_cat_backup, 'Disaster Recovery Plan', 'Documented and tested DR plan with defined RTOs and RPOs', 'DR plan documented, RTO/RPO defined per system, tested annually, stakeholders trained', 3),
  (v_tenant_id, v_cat_backup, 'Endpoint Backup', 'Critical endpoint data backed up (laptops/desktops)', 'OneDrive/Google Drive sync for user files, known data locations redirected, tested', 4),
  (v_tenant_id, v_cat_backup, 'Backup Monitoring & Alerting', 'All backup jobs monitored with failure alerting', 'Automated monitoring, failure alerts within 1 hour, backup report reviewed weekly', 5);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- EMAIL & COMMUNICATION
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_email, 'Email Security Gateway', 'Advanced email filtering with anti-phishing, anti-malware, sandboxing', 'Email security solution active, quarantine reviewed, DMARC/DKIM/SPF configured', 1),
  (v_tenant_id, v_cat_email, 'DMARC/DKIM/SPF Configuration', 'Proper email authentication records preventing spoofing', 'SPF record with -all, DKIM signing enabled, DMARC at p=quarantine or reject', 2),
  (v_tenant_id, v_cat_email, 'Email Encryption', 'Ability to send encrypted email for sensitive communications', 'Message encryption available, auto-encryption rules for sensitive data patterns', 3),
  (v_tenant_id, v_cat_email, 'Unified Communications', 'Modern phone/video/chat platform (Teams, Zoom, etc.)', 'Teams/Zoom deployed, voicemail-to-email, mobile app deployed, call quality monitored', 4);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SERVER & INFRASTRUCTURE
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_server, 'Supported Server OS', 'All servers running vendor-supported operating systems', 'No Server 2012/R2, no unsupported Linux, migration plan for approaching EOL', 1),
  (v_tenant_id, v_cat_server, 'Server Hardware Lifecycle', 'Server hardware under warranty and within lifecycle', 'Servers <7 years, warranty active, RAID with hot spare, capacity >20% free', 2),
  (v_tenant_id, v_cat_server, 'Hypervisor Standards', 'Current supported hypervisor with proper licensing', 'VMware/Hyper-V current version, licensed, HA configured where applicable', 3),
  (v_tenant_id, v_cat_server, 'Server Monitoring', 'Proactive monitoring of all servers (CPU, RAM, disk, services)', 'RMM monitoring all servers, alerts for >85% CPU/RAM/disk, service monitoring', 4),
  (v_tenant_id, v_cat_server, 'Physical Security', 'Server room/closet properly secured and climate controlled', 'Locked server room, A/C with alerting, fire suppression, access log', 5);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- COMPLIANCE
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_compliance, 'Acceptable Use Policy', 'Written AUP signed by all employees', 'Current AUP, signed by all employees, reviewed annually, covers BYOD', 1),
  (v_tenant_id, v_cat_compliance, 'Incident Response Plan', 'Documented incident response procedures', 'IRP documented, roles assigned, tested annually, includes breach notification', 2),
  (v_tenant_id, v_cat_compliance, 'Data Classification Policy', 'Policy defining data sensitivity levels and handling requirements', 'Data classified (public/internal/confidential/restricted), handling procedures defined', 3),
  (v_tenant_id, v_cat_compliance, 'Industry-Specific Compliance', 'Meeting applicable regulatory requirements (HIPAA, PCI, SOC2, etc.)', 'Requirements identified, controls implemented, audit-ready documentation', 4),
  (v_tenant_id, v_cat_compliance, 'Cyber Insurance', 'Active cyber insurance policy with adequate coverage', 'Policy active, coverage adequate for business size, requirements met by controls', 5);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- DOCUMENTATION
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_documentation, 'Network Documentation', 'Current network diagrams, IP schemes, VLAN assignments', 'Network diagram current (<90 days), IP scheme documented, VLAN map, WAN diagram', 1),
  (v_tenant_id, v_cat_documentation, 'Password/Credential Management', 'All credentials stored in approved password vault', 'IT Glue/vault for all creds, no plaintext passwords, shared accounts documented', 2),
  (v_tenant_id, v_cat_documentation, 'Asset Inventory', 'Complete and current asset inventory', 'All devices in Autotask CIs, synced from RMM, reviewed quarterly, disposals tracked', 3),
  (v_tenant_id, v_cat_documentation, 'Standard Operating Procedures', 'Client-specific SOPs for common tasks', 'Onboarding/offboarding, escalation path, VPN setup, print setup documented', 4),
  (v_tenant_id, v_cat_documentation, 'Contact & Escalation Directory', 'Current contact list with escalation paths for client and vendors', 'Key contacts documented, vendor support info, escalation matrix, emergency contacts', 5);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- END USER EXPERIENCE
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO standards (tenant_id, category_id, name, description, criteria, sort_order) VALUES
  (v_tenant_id, v_cat_enduser, 'User Onboarding Process', 'Standardized onboarding with provisioning checklist', 'Onboarding checklist, <24hr account setup, hardware ready day 1, training scheduled', 1),
  (v_tenant_id, v_cat_enduser, 'User Offboarding Process', 'Secure offboarding with access revocation within 1 hour', 'Offboarding checklist, access disabled <1hr of notification, data preserved per policy', 2),
  (v_tenant_id, v_cat_enduser, 'Self-Service Portal', 'Client portal for ticket submission, status tracking, knowledge base', 'Portal available, SSO enabled, KB articles for common issues, password reset self-service', 3),
  (v_tenant_id, v_cat_enduser, 'CSAT/Feedback Collection', 'Systematic collection of end-user satisfaction feedback', 'Post-ticket survey, response rate >30%, monthly CSAT reviewed, action on negative feedback', 4),
  (v_tenant_id, v_cat_enduser, 'Remote Support Tools', 'Reliable and secure remote support capability', 'Splashtop/ScreenConnect deployed, unattended access available, session logging enabled', 5);

  RAISE NOTICE 'Seeded % standards across 10 categories', (SELECT count(*) FROM standards WHERE tenant_id = v_tenant_id);
END $$;
