/**
 * Auvik Network Device Sync Service.
 *
 * Pulls network device inventory from Auvik API and upserts into assets table.
 * Matches tenants to clients by domainPrefix (fuzzy match).
 * Handles 308 redirects to correct region URL.
 */

const axios = require('axios')
const db = require('../db')

function buildClient() {
  return axios.create({
    baseURL: process.env.AUVIK_BASE_URL || 'https://auvikapi.us6.my.auvik.com/v1',
    auth: {
      username: process.env.AUVIK_API_USER,
      password: process.env.AUVIK_API_KEY,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    maxRedirects: 5,
    // Auvik may return 308 redirects
    validateStatus: (status) => status < 400 || status === 308,
  })
}

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'auvik', 'Auvik', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

// Handle potential 308 redirect by following Location header
async function auvikGet(client, path, params = {}) {
  let res = await client.get(path, { params })

  // Follow 308 redirects
  if (res.status === 308 && res.headers.location) {
    const redirectUrl = res.headers.location
    res = await axios.get(redirectUrl, {
      auth: {
        username: process.env.AUVIK_API_USER,
        password: process.env.AUVIK_API_KEY,
      },
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return res
}

// Device type mapping
const AUVIK_TYPE_MAP = {
  'switch':       'Switch',
  'router':       'Router',
  'firewall':     'Firewall',
  'access point': 'Access Point',
  'controller':   'Access Point',
  'printer':      'Printer',
  'server':       'Server',
  'workstation':  'Workstation',
  'phone':        'Phone',
  'ups':          'UPS',
  'hypervisor':   'Server',
  'virtual':      'Virtual Machine',
  'storage':      'NAS/SAN',
}

function mapDeviceType(auvikType) {
  if (!auvikType) return 'Other'
  const lower = auvikType.toLowerCase()
  for (const [key, value] of Object.entries(AUVIK_TYPE_MAP)) {
    if (lower.includes(key)) return value
  }
  return 'Other'
}

// Fuzzy client name matcher
function buildClientMatcher(clientRows) {
  const lookup = {}
  for (const c of clientRows) lookup[c.name.toLowerCase().trim()] = c.id
  return function findClientId(name) {
    if (!name) return null
    const lower = name.toLowerCase().trim()
    if (lookup[lower]) return lookup[lower]
    for (const [clientName, id] of Object.entries(lookup)) {
      if (lower.includes(clientName) || clientName.includes(lower)) return id
    }
    return null
  }
}

async function syncAuvik(tenantId) {
  if (!process.env.AUVIK_API_USER || !process.env.AUVIK_API_KEY) {
    throw new Error('Auvik API credentials not configured')
  }

  const client = buildClient()

  await ensureSyncSource(tenantId)

  // Build client name matcher
  const clientsResult = await db.query(
    `SELECT id, name FROM clients WHERE tenant_id = $1`,
    [tenantId]
  )
  const findClient = buildClientMatcher(clientsResult.rows)

  // Get asset type mapping
  const typeMap = {}
  const types = await db.query(`SELECT id, name FROM asset_types WHERE tenant_id = $1`, [tenantId])
  for (const t of types.rows) typeMap[t.name] = t.id

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'assets', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'auvik'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // ─── Fetch all tenants ────────────────────────────────────────────────
    console.log('[auvik-sync] Fetching tenants...')
    const tenantsRes = await auvikGet(client, '/tenants')
    const auvikTenants = tenantsRes.data?.data || []
    console.log(`[auvik-sync] Fetched ${auvikTenants.length} tenants`)

    // Map tenants to clients by domainPrefix
    const tenantClientMap = {} // auvik tenant ID → align client_id
    for (const t of auvikTenants) {
      const attrs = t.attributes || {}
      const domainPrefix = attrs.domainPrefix || ''
      const tenantName = attrs.displayName || domainPrefix
      const clientId = findClient(tenantName) || findClient(domainPrefix)
      if (clientId) {
        tenantClientMap[t.id] = clientId
      }
    }

    console.log(`[auvik-sync] Matched ${Object.keys(tenantClientMap).length}/${auvikTenants.length} tenants to clients`)

    // ─── Fetch devices for each tenant ────────────────────────────────────
    let allDevices = []
    let tenantCount = 0

    for (const t of auvikTenants) {
      const auvikTenantId = t.id
      if (!tenantClientMap[auvikTenantId]) continue

      try {
        let nextUrl = null
        let firstPage = true

        while (firstPage || nextUrl) {
          let res
          if (firstPage) {
            res = await auvikGet(client, '/inventory/device/info', {
              tenants: auvikTenantId,
              'page[first]': 100,
            })
            firstPage = false
          } else {
            // Follow pagination link directly
            res = await axios.get(nextUrl, {
              auth: {
                username: process.env.AUVIK_API_USER,
                password: process.env.AUVIK_API_KEY,
              },
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const devices = res.data?.data || []
          for (const d of devices) d._auvikTenantId = auvikTenantId
          allDevices = allDevices.concat(devices)

          nextUrl = res.data?.links?.next || null

          // Rate limit protection
          await new Promise(r => setTimeout(r, 300))
        }

        tenantCount++
        if (tenantCount % 10 === 0) {
          console.log(`[auvik-sync] Processed ${tenantCount} tenants (${allDevices.length} devices)`)
        }
      } catch (tenantErr) {
        if (tenantErr.response?.status === 429) {
          const retryAfter = parseInt(tenantErr.response.headers['retry-after'] || '10', 10)
          console.log(`[auvik-sync] Rate limited, waiting ${retryAfter}s...`)
          await new Promise(r => setTimeout(r, retryAfter * 1000))
        } else {
          console.warn(`[auvik-sync] Failed to fetch devices for tenant ${auvikTenantId}: ${tenantErr.message}`)
        }
      }
    }

    console.log(`[auvik-sync] Fetched ${allDevices.length} devices from ${tenantCount} tenants`)

    // ─── Upsert devices into assets ───────────────────────────────────────
    let created = 0, updated = 0, skipped = 0

    for (const device of allDevices) {
      const attrs = device.attributes || {}
      const clientId = tenantClientMap[device._auvikTenantId]
      if (!clientId) { skipped++; continue }

      const deviceId = device.id
      if (!deviceId) { skipped++; continue }

      // Map device type
      const typeName = mapDeviceType(attrs.deviceType)
      const assetTypeId = typeMap[typeName] || typeMap['Other'] || null

      const isOnline = attrs.onlineStatus === 'online' || attrs.onlineStatus === true

      const result = await db.query(
        `INSERT INTO assets (
          tenant_id, client_id, asset_type_id, name,
          manufacturer, model, serial_number,
          is_online, is_active,
          primary_source, auvik_device_id, auvik_data, last_seen_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'auvik',$9,$10,NOW())
        ON CONFLICT (tenant_id, auvik_device_id) WHERE auvik_device_id IS NOT NULL
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          asset_type_id = EXCLUDED.asset_type_id,
          name = EXCLUDED.name,
          manufacturer = EXCLUDED.manufacturer,
          model = EXCLUDED.model,
          serial_number = EXCLUDED.serial_number,
          is_online = EXCLUDED.is_online,
          auvik_data = EXCLUDED.auvik_data,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          assetTypeId,
          attrs.deviceName || `Auvik Device ${deviceId}`,
          attrs.vendorName || null,
          attrs.makeModel || null,
          attrs.serialNumber || null,
          isOnline,
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

    console.log(`[auvik-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total: allDevices.length, created, updated, skipped }
  } catch (err) {
    console.error('[auvik-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncAuvik }
