/**
 * Datto RMM Device Sync Service.
 *
 * Pulls device inventory from Datto RMM via OAuth2 and upserts into assets table.
 * Matches sites to clients via autotaskCompanyId on the site object.
 */

const axios = require('axios')
const db = require('../db')
const { upsertDattoAsset } = require('../lib/assetUpsert')

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
  console.log('[datto-rmm-sync] OAuth2 token acquired')
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

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'datto_rmm', 'Datto RMM', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

// Device type mapping
const TYPE_MAP = {
  'desktop':  'Workstation',
  'laptop':   'Laptop',
  'server':   'Server',
  'esxihost': 'Server',
  'printer':  'Printer',
  'network':  'Router',
}

async function syncDattoRmm(tenantId) {
  if (!process.env.DATTO_RMM_API_URL || !process.env.DATTO_RMM_API_KEY) {
    throw new Error('Datto RMM API credentials not configured')
  }

  const token = await getAccessToken()
  const client = buildClient(token)

  await ensureSyncSource(tenantId)

  // Build client mapping: autotask_company_id → align client_id
  const clientMap = {}
  const clientsResult = await db.query(
    `SELECT id, autotask_company_id FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
    [tenantId]
  )
  for (const c of clientsResult.rows) clientMap[c.autotask_company_id] = c.id

  // Get asset type mapping
  const typeMap = {}
  const types = await db.query(`SELECT id, name FROM asset_types WHERE tenant_id = $1`, [tenantId])
  for (const t of types.rows) typeMap[t.name] = t.id

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'assets', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'datto_rmm'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // ─── Fetch all sites ──────────────────────────────────────────────────
    console.log('[datto-rmm-sync] Fetching sites...')
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

    console.log(`[datto-rmm-sync] Fetched ${allSites.length} sites`)

    // Build site → client mapping via autotaskCompanyId
    const siteClientMap = {}
    for (const site of allSites) {
      const atId = site.autotaskCompanyId || site.autotask_company_id
      if (atId && clientMap[atId]) {
        siteClientMap[site.uid || site.id] = clientMap[atId]
      }
    }

    // ─── Fetch devices for each site ──────────────────────────────────────
    let allDevices = []
    let siteCount = 0

    for (const site of allSites) {
      const siteUid = site.uid || site.id
      if (!siteUid) continue

      try {
        let siteDevices = []
        let devPage = 0
        let devHasMore = true

        while (devHasMore) {
          const res = await client.get(`/api/v2/site/${siteUid}/devices`, {
            params: { max: 250, page: devPage },
          })
          const devices = res.data?.devices || res.data?.data || []
          for (const d of devices) d._siteUid = siteUid
          siteDevices = siteDevices.concat(devices)
          devHasMore = devices.length === 250
          devPage++
          if (devHasMore) await new Promise(r => setTimeout(r, 300))
        }

        allDevices = allDevices.concat(siteDevices)
        siteCount++

        if (siteCount % 20 === 0) {
          console.log(`[datto-rmm-sync] Processed ${siteCount}/${allSites.length} sites (${allDevices.length} devices)`)
        }
      } catch (siteErr) {
        console.warn(`[datto-rmm-sync] Failed to fetch devices for site ${siteUid}: ${siteErr.message}`)
      }

      // Rate limit protection
      await new Promise(r => setTimeout(r, 200))
    }

    console.log(`[datto-rmm-sync] Fetched ${allDevices.length} devices from ${siteCount} sites`)

    // Deduplicate by device UID — same physical device can appear in multiple
    // sites in Datto RMM (e.g. moved devices, sub-sites). Keep first occurrence.
    const seenDeviceIds = new Set()
    const uniqueDevices = []
    for (const d of allDevices) {
      const uid = d.uid || d.id?.toString()
      if (uid && !seenDeviceIds.has(uid)) {
        seenDeviceIds.add(uid)
        uniqueDevices.push(d)
      }
    }
    if (uniqueDevices.length < allDevices.length) {
      console.log(`[datto-rmm-sync] Deduped ${allDevices.length - uniqueDevices.length} duplicate devices (${uniqueDevices.length} unique)`)
    }
    const devicesToProcess = uniqueDevices

    // ─── Upsert devices into assets ───────────────────────────────────────
    let created = 0, updated = 0, skipped = 0

    for (const device of devicesToProcess) {
      const clientId = siteClientMap[device._siteUid]
      if (!clientId) { skipped++; continue }

      const deviceId = device.uid || device.id?.toString()
      if (!deviceId) { skipped++; continue }

      // Skip deleted or archived devices
      if (device.deleted === true || device.archived === true) { skipped++; continue }

      // Map device type
      const dtRaw = typeof device.deviceType === 'object' ? (device.deviceType?.category || '') : (device.deviceType || '')
      const dtLower = dtRaw.toLowerCase()
      const typeName = TYPE_MAP[dtLower] || 'Other'
      const assetTypeId = typeMap[typeName] || typeMap['Other'] || null

      // Validate IP
      const ipRaw = device.intIpAddress || device.ipAddress || null
      const ipAddress = ipRaw && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipRaw) ? ipRaw : null

      // Extract last user — strip domain prefix (DOMAIN\user → user)
      const lastUserRaw = device.lastLoggedInUser || null
      const lastUser = lastUserRaw
        ? (lastUserRaw.includes('\\') ? lastUserRaw.split('\\').pop() : lastUserRaw)
        : null

      // Note: The concord-api Datto RMM API does not return hardware audit fields
      // (manufacturer, model, CPU, RAM) in the device list or device detail response.
      // Hardware data comes through Autotask's rmmDeviceAudit* fields — use the
      // backfill-hardware endpoint to resolve those from stored autotask_data.
      const upsertResult = await upsertDattoAsset({
        tenantId,
        clientId,
        assetTypeId,
        deviceId,
        name: device.hostname || device.deviceName || `Device ${deviceId}`,
        serial: device.serialNumber || null,
        os: device.operatingSystem || null,
        ipAddress,
        warrantyDate: device.warrantyDate || null,
        isOnline: device.online === true || device.online === 'true',
        lastUser,
        hostname: device.hostname || null,
        ramBytes: null,
        storageBytes: null,
        storageFreeBytes: null,
        cpuDescription: null,
        cpuCores: null,
        manufacturer: null,
        model: null,
        deviceData: device,
      })

      if (upsertResult.isNew) created++
      else updated++
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, devicesToProcess.length, created, updated, skipped]
      )
    }

    // NOTE: The Datto RMM concord-api does not expose hardware audit data
    // (manufacturer, model, CPU, RAM, storage) via its REST API. Hardware specs
    // are synced through Autotask's rmmDeviceAudit* ConfigurationItem fields.
    // Use POST /api/sync/backfill-hardware to resolve those fields from autotask_data.

    // Load tenant inactive threshold (default 60 days)
    const settingsRow = await db.query(
      `SELECT rmm_inactive_threshold_days, rmm_inactive_action FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId]
    )
    const thresholdDays = settingsRow.rows[0]?.rmm_inactive_threshold_days ?? 60
    const inactiveAction = settingsRow.rows[0]?.rmm_inactive_action ?? 'mark_inactive'

    if (inactiveAction === 'mark_inactive') {
      const staleResult = await db.query(
        `UPDATE assets SET is_active = false
         WHERE tenant_id = $1
           AND datto_rmm_device_id IS NOT NULL
           AND last_seen_at IS NOT NULL
           AND last_seen_at < NOW() - ($2 || ' days')::INTERVAL
           AND (is_online = false OR is_online IS NULL)`,
        [tenantId, thresholdDays]
      )
      if (staleResult.rowCount > 0) {
        console.log(`[datto-rmm-sync] Marked ${staleResult.rowCount} stale assets inactive (threshold: ${thresholdDays}d)`)
      }
    }

    console.log(`[datto-rmm-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped (${devicesToProcess.length} unique devices)`)
    return { total: allDevices.length, created, updated, skipped }
  } catch (err) {
    console.error('[datto-rmm-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncDattoRmm }
