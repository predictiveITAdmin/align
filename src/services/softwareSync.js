/**
 * Datto RMM Software Sync Service.
 *
 * Pulls installed software from each managed device via Datto RMM API
 * and upserts into software_inventory table.
 */

const axios = require('axios')
const db = require('../db')

// ─── OAuth2 token management ─────────────────────────────────────────────────

let tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token
  }

  const apiUrl = process.env.DATTO_RMM_API_URL
  const res = await axios.post(
    `${apiUrl}/auth/oauth/token`,
    `grant_type=password&username=${encodeURIComponent(process.env.DATTO_RMM_API_KEY)}&password=${encodeURIComponent(process.env.DATTO_RMM_API_SECRET)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from('public-client:public').toString('base64'),
      },
    }
  )

  tokenCache.token = res.data.access_token
  tokenCache.expiresAt = Date.now() + (res.data.expires_in || 3600) * 1000
  console.log('[software-sync] OAuth2 token acquired')
  return tokenCache.token
}

function buildClient(token) {
  return axios.create({
    baseURL: process.env.DATTO_RMM_API_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

async function syncSoftware(tenantId) {
  if (!process.env.DATTO_RMM_API_URL || !process.env.DATTO_RMM_API_KEY) {
    throw new Error('Datto RMM API credentials not configured')
  }

  const token = await getAccessToken()
  const client = buildClient(token)

  // Ensure sync source exists
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'datto_rmm', 'Datto RMM', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )

  // ─── Build client mapping: autotask_company_id → align client_id ───────────
  const clientMap = {}
  const clientsResult = await db.query(
    `SELECT id, autotask_company_id FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
    [tenantId]
  )
  for (const c of clientsResult.rows) clientMap[c.autotask_company_id] = c.id

  // ─── Fetch all sites and build siteClientMap ────────────────────────────────
  console.log('[software-sync] Fetching sites...')
  let allSites = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const res = await client.get('/api/v2/account/sites', {
      params: { max: 250, page },
    })
    const sites = res.data?.sites || res.data?.data || []
    allSites = allSites.concat(sites)
    hasMore = sites.length === 250
    page++
    if (hasMore) await new Promise(r => setTimeout(r, 300))
  }

  console.log(`[software-sync] Fetched ${allSites.length} sites`)

  const siteClientMap = {}
  for (const site of allSites) {
    const atId = site.autotaskCompanyId || site.autotask_company_id
    if (atId && clientMap[atId]) {
      siteClientMap[site.uid || site.id] = clientMap[atId]
    }
  }

  // ─── Build assetMap: datto_rmm_device_id → { id: asset_id, client_id } ─────
  const assetMapResult = await db.query(
    `SELECT id, client_id, datto_rmm_device_id
     FROM assets
     WHERE tenant_id = $1 AND datto_rmm_device_id IS NOT NULL`,
    [tenantId]
  )
  const assetMap = {}
  for (const row of assetMapResult.rows) {
    assetMap[row.datto_rmm_device_id] = { id: row.id, client_id: row.client_id }
  }

  console.log(`[software-sync] Found ${Object.keys(assetMap).length} assets with Datto RMM device IDs`)

  // ─── Create sync log entry ──────────────────────────────────────────────────
  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'software', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'datto_rmm'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  // ─── Ensure unique index exists ─────────────────────────────────────────────
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sw_device_name
     ON software_inventory(tenant_id, datto_rmm_device_id, LOWER(name))
     WHERE datto_rmm_device_id IS NOT NULL`
  )

  let created = 0, updated = 0, skipped = 0
  let deviceCount = 0

  try {
    for (const [deviceUid, assetInfo] of Object.entries(assetMap)) {
      deviceCount++

      try {
        const res = await client.get(`/api/v2/audit/device/${deviceUid}/software`)
        const softwareList = res.data?.software || res.data?.data || []

        if (softwareList.length === 0) {
          skipped++
          await new Promise(r => setTimeout(r, 300))
          continue
        }

        // Delete existing records for this device then insert fresh
        await db.query(
          `DELETE FROM software_inventory WHERE tenant_id = $1 AND datto_rmm_device_id = $2`,
          [tenantId, deviceUid]
        )

        for (const sw of softwareList) {
          if (!sw.name) continue

          // Auto-detect software category from name
          let category = null
          if (/datto edr|webroot|sentinelone|crowdstrike|norton|mcafee|eset|malwarebytes|bitdefender|sophos|defender|huntress/i.test(sw.name)) category = 'Endpoint protection'
          else if (/datto rmm|connectwise automate|ninjarmm|kaseya|atera/i.test(sw.name)) category = 'RMM'
          else if (/microsoft 365|microsoft office|libreoffice/i.test(sw.name)) category = 'Office suite'
          else if (/windows server|windows 10|windows 11/i.test(sw.name)) category = 'OS'
          else if (/chrome|edge|firefox|safari|brave/i.test(sw.name)) category = 'Web browser'
          else if (/dropbox|onedrive|google drive|box sync|box drive/i.test(sw.name)) category = 'Cloud storage'
          else if (/teams|slack|zoom|webex|ringcentral/i.test(sw.name)) category = 'Communication'
          else if (/splashtop|teamviewer|anydesk|screenconnect|logmein/i.test(sw.name)) category = 'Remote control'
          else if (/quickbooks|sage 50|sage 100|xero|freshbooks/i.test(sw.name)) category = 'Accounting'
          else if (/java runtime|\.net|visual c\+\+|node\.js|python/i.test(sw.name)) category = 'Runtime'
          else if (/veeam|acronis|datto bcdr|carbonite|backblaze/i.test(sw.name)) category = 'Backup'
          else if (/adobe acrobat|foxit|nitro pdf/i.test(sw.name)) category = 'PDF'
          else if (/vmware tools|dell support|lenovo vantage|hp support/i.test(sw.name)) category = 'Maintenance utility'

          // Auto-detect publisher from name
          let publisher = sw.vendor || null
          if (!publisher) {
            const PUB_MAP = [
              ['Microsoft', /^Microsoft /i], ['Adobe', /^Adobe /i], ['Google', /^Google /i],
              ['Apple', /^Apple /i], ['Cisco', /^Cisco /i], ['Dell', /^Dell /i],
              ['HP', /^HP /i], ['Lenovo', /^Lenovo /i], ['VMware', /^VMware /i],
              ['Intel', /^Intel[\s(®]/i], ['Datto', /^Datto /i], ['Mozilla', /^Mozilla /i],
              ['Oracle', /^Oracle|^Java /i], ['Intuit', /QuickBooks/i], ['Zoom', /^Zoom /i],
              ['Dropbox', /^Dropbox/i], ['Splashtop', /^Splashtop/i], ['NVIDIA', /^NVIDIA/i],
              ['Realtek', /^Realtek/i], ['Autodesk', /^Autodesk|^AutoCAD/i],
              ['SentinelOne', /^SentinelOne/i], ['CrowdStrike', /^CrowdStrike/i],
              ['Webroot', /^Webroot/i], ['Sophos', /^Sophos/i], ['ESET', /^ESET /i],
              ['Huntress', /^Huntress/i], ['ConnectWise', /^ConnectWise|^ScreenConnect/i],
              ['Veeam', /^Veeam /i], ['Foxit', /^Foxit /i], ['Fortinet', /^Forti/i],
            ]
            for (const [pub, re] of PUB_MAP) {
              if (re.test(sw.name)) { publisher = pub; break }
            }
          }

          await db.query(
            `INSERT INTO software_inventory
               (tenant_id, client_id, asset_id, datto_rmm_device_id,
                name, version, vendor, publisher, install_date,
                is_managed, category, last_seen_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
             ON CONFLICT (tenant_id, datto_rmm_device_id, LOWER(name))
             WHERE datto_rmm_device_id IS NOT NULL
             DO UPDATE SET
               version = EXCLUDED.version,
               vendor = COALESCE(EXCLUDED.vendor, software_inventory.vendor),
               publisher = COALESCE(software_inventory.publisher, EXCLUDED.publisher),
               install_date = EXCLUDED.install_date,
               category = COALESCE(software_inventory.category, EXCLUDED.category),
               last_seen_at = NOW(),
               updated_at = NOW()`,
            [
              tenantId,
              assetInfo.client_id,
              assetInfo.id,
              deviceUid,
              sw.name,
              sw.version || null,
              sw.vendor || null,
              publisher,
              sw.installDate || null,
              false,
              category,
            ]
          )
          created++
        }

        if (deviceCount % 50 === 0) {
          console.log(`[software-sync] Processed ${deviceCount}/${Object.keys(assetMap).length} devices`)
        }
      } catch (devErr) {
        console.warn(`[software-sync] Failed to fetch software for device ${deviceUid}: ${devErr.message}`)
        skipped++
      }

      // Rate limit: 300ms between device calls
      await new Promise(r => setTimeout(r, 300))
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, deviceCount, created, updated, skipped]
      )
    }

    console.log(`[software-sync] Done: ${created} software records inserted, ${skipped} devices skipped`)
    return { total: deviceCount, created, updated, skipped }
  } catch (err) {
    console.error('[software-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncSoftware }
