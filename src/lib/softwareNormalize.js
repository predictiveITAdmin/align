/**
 * Software normalization — product grouping and noise filtering.
 *
 * Used by /api/software/products and /api/software/catalog to provide
 * a clean, LMX-style view of installed software.
 */

// ── Noise patterns: hardware drivers & system internals not useful for MSP reporting
const NOISE_PATTERNS = [
  /^Windows Driver Package/i,
  /^Windows PC Health Check$/i,
  /^Update for Windows/i,
  /^Microsoft Update Health/i,
  /^Microsoft Policy Platform$/i,
  /^Microsoft DCF MUI/i,
  /^Microsoft Edge WebView/i,
  /^Intel\(R\) (Chipset|Management Engine|Processor|Serial IO|Rapid|Trusted|HID|Gaussian|Network Connections|Optane)/i,
  /^Realtek (Audio|Card Reader|Ethernet|High Definition|USB|I2S)/i,
  /^NVIDIA (Graphics|PhysX|GeForce|HD Audio|FrameView|Optimus|Update)/i,
  /^AMD (Software|Catalyst|Chipset|Radeon)/i,
  /^Bonjour$/i,
  /^Java Auto Updater$/i,
  /AddressBookSourceSync/i,
  /^BCM_Inst$/i,
  /^ffvfw/i,
  /^GenICam/i,
]

// ── Product family grouping: maps raw names to a normalized product name ──────
// Only group things that are clearly variants of the same product.
// Visual C++ redistributables are kept individual (matching LMX behavior).
const GROUP_RULES = [
  // .NET → group the many sub-versions into families
  { match: /^Microsoft \.NET (Framework \d)/i, groupFn: (name, m) => `.NET ${m[1]}`, publisher: 'Microsoft', category: 'Runtime' },
  { match: /^Microsoft \.NET Runtime/i, group: '.NET Runtime', publisher: 'Microsoft', category: 'Runtime' },
  { match: /^Microsoft ASP\.NET Core (\d+)\./i, groupFn: (name, m) => `ASP.NET Core ${m[1]}`, publisher: 'Microsoft', category: 'Runtime' },
  { match: /^Microsoft Windows Desktop Runtime/i, group: '.NET Desktop Runtime', publisher: 'Microsoft', category: 'Runtime' },
  // SQL Server → group sub-components by major version
  { match: /^Microsoft SQL Server (\d{4})/i, groupFn: (name, m) => `Microsoft SQL Server ${m[1]}`, publisher: 'Microsoft', category: 'Database' },
  { match: /^Browser for SQL Server/i, group: 'SQL Server Browser', publisher: 'Microsoft', category: 'Database' },
  // Windows OS
  { match: /^Windows 10$/i, group: 'Windows 10', publisher: 'Microsoft', category: 'OS' },
  { match: /^Windows 11$/i, group: 'Windows 11', publisher: 'Microsoft', category: 'OS' },
  { match: /^Windows Server/i, group: 'Windows Server', publisher: 'Microsoft', category: 'OS' },
  // Microsoft 365 / Office
  { match: /^Microsoft 365 Apps/i, group: 'Microsoft 365', publisher: 'Microsoft', category: 'Office suite' },
  { match: /^Microsoft Office/i, group: 'Microsoft Office', publisher: 'Microsoft', category: 'Office suite' },
  // Stamps.com variants
  { match: /^Stamps\.com/i, group: 'Stamps.com', publisher: 'Stamps.com', category: 'LOB' },
  // Acronis
  { match: /^Acronis True Image/i, group: 'Acronis True Image', publisher: 'Acronis', category: 'Backup' },
  // GoTo products
  { match: /^GoTo(Meeting|Opener)/i, group: 'GoToMeeting', publisher: 'LogMeIn', category: 'Communication' },
  // Pulse Secure
  { match: /^Pulse Secure/i, group: 'Pulse Secure VPN', publisher: 'Ivanti', category: 'VPN' },
  // Duo
  { match: /^Duo (Authentication|Desktop)/i, group: 'Duo Security', publisher: 'Cisco', category: 'Endpoint protection' },
  // Veeam → group all sub-components
  { match: /^Veeam /i, group: 'Veeam Backup & Replication', publisher: 'Veeam', category: 'Backup' },
  // VMware → group tools/client
  { match: /^VMware (Tools|Horizon|VDDK)/i, group: 'VMware Tools', publisher: 'VMware', category: 'Maintenance utility' },
  // PaperStream variants
  { match: /^PaperStream/i, group: 'PaperStream', publisher: 'Fujitsu', category: 'LOB' },
  // Microsoft Visual C++ → group by year+arch for cleaner view
  { match: /^Microsoft Visual C\+\+ (\d{4}).*Redistributable.*\((x64|x86)\)/i, groupFn: (name, m) => `Microsoft Visual C++ ${m[1]} Redistributable (${m[2]})`, publisher: 'Microsoft', category: 'Runtime' },
]

/**
 * Returns true if this software name is "noise" (drivers, runtimes, system tools).
 */
function isNoise(name) {
  return NOISE_PATTERNS.some(p => p.test(name))
}

/**
 * Given a raw software name, returns either a normalized group name or null (no grouping).
 * Also returns inferred publisher/category if the rule provides them.
 */
function normalizeProduct(name) {
  for (const rule of GROUP_RULES) {
    const m = name.match(rule.match)
    if (m) {
      return {
        name: rule.groupFn ? rule.groupFn(name, m) : rule.group,
        publisher: rule.publisher || null,
        category: rule.category || null,
      }
    }
  }
  return null
}

/**
 * Post-process a list of product rows (from SQL GROUP BY name) to:
 * 1. Filter noise (if hideNoise=true)
 * 2. Merge grouped products (summing device counts, picking max version)
 */
function normalizeProductList(rows, { hideNoise = true } = {}) {
  const grouped = {}

  for (const row of rows) {
    if (hideNoise && isNoise(row.product_name)) continue

    const norm = normalizeProduct(row.product_name)
    const key = norm ? norm.name : row.product_name

    if (!grouped[key]) {
      grouped[key] = {
        product_name: key,
        publisher: norm?.publisher || row.publisher || null,
        category: norm?.category || row.category || null,
        installed_count: 0,
        not_installed_count: 0,
        device_count: 0,
        client_count: 0,
        latest_version: row.latest_version || row.version || null,
        last_seen_at: row.last_seen_at || null,
        is_lob: row.is_lob || false,
        _device_set: new Set(),
        _client_set: new Set(),
        _raw_names: [],
      }
    }

    const g = grouped[key]
    // Merge counts — use sets to deduplicate when combining groups
    if (row.installed_count !== undefined) g.installed_count += parseInt(row.installed_count || 0)
    if (row.not_installed_count !== undefined) g.not_installed_count = Math.max(g.not_installed_count, parseInt(row.not_installed_count || 0))
    if (row.device_count !== undefined) g.device_count += parseInt(row.device_count || 0)
    if (row.client_count !== undefined) g.client_count = Math.max(g.client_count, parseInt(row.client_count || 0))
    if (!g.publisher && row.publisher) g.publisher = row.publisher
    if (!g.category && row.category) g.category = row.category
    if (row.is_lob) g.is_lob = true
    g._raw_names.push(row.product_name)
  }

  return Object.values(grouped).map(g => {
    const { _device_set, _client_set, _raw_names, ...rest } = g
    return { ...rest, raw_names: _raw_names }
  }).sort((a, b) => (b.installed_count || b.device_count) - (a.installed_count || a.device_count) || a.product_name.localeCompare(b.product_name))
}

module.exports = { isNoise, normalizeProduct, normalizeProductList }
