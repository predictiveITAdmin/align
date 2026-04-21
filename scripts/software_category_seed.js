require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { Pool } = require('pg')
const pool = new Pool()

const CATEGORY_PATTERNS = [
  ['Endpoint protection', ['Datto EDR', 'Webroot', 'SentinelOne', 'CrowdStrike', 'Norton', 'McAfee', 'ESET', 'Malwarebytes', 'Bitdefender', 'Sophos', 'Defender', 'Huntress']],
  ['RMM', ['Datto RMM', 'ConnectWise Automate', 'NinjaRMM', 'Kaseya', 'Atera']],
  ['Office suite', ['Microsoft 365', 'Microsoft Office', 'LibreOffice']],
  ['OS', ['Windows Server', 'Windows 10', 'Windows 11']],
  ['Web browser', ['Google Chrome', 'Microsoft Edge', 'Mozilla Firefox', 'Safari', 'Brave']],
  ['Cloud storage', ['Dropbox', 'OneDrive', 'Google Drive', 'Box Sync', 'Box Drive']],
  ['Communication', ['Microsoft Teams', 'Slack', 'Zoom', 'Webex', 'RingCentral']],
  ['Remote control', ['Splashtop', 'TeamViewer', 'AnyDesk', 'ConnectWise Control', 'LogMeIn', 'ScreenConnect']],
  ['Accounting', ['QuickBooks', 'Sage 50', 'Sage 100', 'Xero', 'FreshBooks']],
  ['Runtime', ['Java Runtime', '.NET', 'Visual C++', 'Node.js', 'Python']],
  ['Backup', ['Veeam', 'Acronis', 'Datto BCDR', 'Carbonite', 'Backblaze', 'ShadowProtect']],
  ['PDF', ['Adobe Acrobat', 'Foxit', 'Nitro PDF']],
  ['Maintenance utility', ['VMware Tools', 'Dell SupportAssist', 'Lenovo Vantage', 'HP Support']],
  ['Password manager', ['LastPass', '1Password', 'Keeper', 'Bitwarden', 'Dashlane']],
  ['VPN', ['Cisco AnyConnect', 'OpenVPN', 'WireGuard', 'FortiClient', 'GlobalProtect']],
]

async function run() {
  // Add column if needed
  await pool.query('ALTER TABLE software_inventory ADD COLUMN IF NOT EXISTS category TEXT')
  console.log('Category column ensured')

  let total = 0
  for (const [cat, patterns] of CATEGORY_PATTERNS) {
    for (const p of patterns) {
      const r = await pool.query(
        `UPDATE software_inventory SET category = $1 WHERE category IS NULL AND name ILIKE $2`,
        [cat, `%${p}%`]
      )
      total += r.rowCount
    }
  }
  console.log(`Categorized ${total} software records`)
  await pool.end()
}

run().catch(err => { console.error(err); process.exit(1) })
