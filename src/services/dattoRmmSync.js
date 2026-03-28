/**
 * Datto RMM Device Sync Service.
 *
 * Pulls device inventory from Datto RMM via OAuth2 and upserts into assets table.
 * Matches sites to clients via autotaskCompanyId on the site object.
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

    // ─── Upsert devices into assets ───────────────────────────────────────
    let created = 0, updated = 0, skipped = 0

    for (const device of allDevices) {
      const clientId = siteClientMap[device._siteUid]
      if (!clientId) { skipped++; continue }

      const deviceId = device.uid || device.id?.toString()
      if (!deviceId) { skipped++; continue }

      // Map device type
      const dtRaw = typeof device.deviceType === 'object' ? (device.deviceType?.category || '') : (device.deviceType || '')
      const dtLower = dtRaw.toLowerCase()
      const typeName = TYPE_MAP[dtLower] || 'Other'
      const assetTypeId = typeMap[typeName] || typeMap['Other'] || null

      // Validate IP
      const ipRaw = device.intIpAddress || device.ipAddress || null
      const ipAddress = ipRaw && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipRaw) ? ipRaw : null

      const result = await db.query(
        `INSERT INTO assets (
          tenant_id, client_id, asset_type_id, name,
          serial_number, operating_system, ip_address,
          warranty_expiry, is_online, is_active,
          primary_source, datto_rmm_device_id, datto_rmm_data, last_seen_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9,true,'datto_rmm',$10,$11,NOW())
        ON CONFLICT (tenant_id, datto_rmm_device_id) WHERE datto_rmm_device_id IS NOT NULL
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          asset_type_id = EXCLUDED.asset_type_id,
          name = EXCLUDED.name,
          serial_number = EXCLUDED.serial_number,
          operating_system = EXCLUDED.operating_system,
          ip_address = EXCLUDED.ip_address,
          warranty_expiry = EXCLUDED.warranty_expiry,
          is_online = EXCLUDED.is_online,
          datto_rmm_data = EXCLUDED.datto_rmm_data,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          assetTypeId,
          device.hostname || device.deviceName || `Device ${deviceId}`,
          device.serialNumber || null,
          device.operatingSystem || null,
          ipAddress,
          device.warrantyDate || null,
          device.online === true || device.online === 'true',
          deviceId,
          JSON.stringify(device),
        ]
      )

      if (result.rows[0]?.is_insert) created++
      else updated++
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, allDevices.length, created, updated, skipped]
      )
    }

    console.log(`[datto-rmm-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
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
