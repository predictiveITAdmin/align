/**
 * IT Glue Configurations Sync Service.
 *
 * Pulls configuration items from IT Glue and upserts into assets table.
 * Filters to active customer organizations only.
 * Matches organizations to clients by name.
 */

const axios = require('axios')
const db = require('../db')
const { upsertItGlueAsset } = require('../lib/assetUpsert')

const ITGLUE_BASE = 'https://api.itglue.com'
const ACTIVE_ORG_STATUS_ID = 79219
const CUSTOMER_ORG_TYPE_ID = 228344

function buildClient() {
  return axios.create({
    baseURL: ITGLUE_BASE,
    headers: {
      'x-api-key': process.env.ITGLUE_API_KEY,
      'Content-Type': 'application/vnd.api+json',
    },
  })
}

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'it_glue', 'IT Glue', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
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

async function syncItGlue(tenantId) {
  if (!process.env.ITGLUE_API_KEY) {
    throw new Error('IT Glue API key not configured')
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

  // Configuration type name → asset type name mapping
  const CONFIG_TYPE_MAP = {
    'workstation':        'Workstation',
    'desktop':            'Workstation',
    'laptop':             'Laptop',
    'server':             'Server',
    'printer':            'Printer',
    'firewall':           'Firewall',
    'switch':             'Switch',
    'router':             'Router',
    'wireless':           'Access Point',
    'access point':       'Access Point',
    'ups':                'UPS',
    'virtual machine':    'Virtual Machine',
    'vm':                 'Virtual Machine',
    'nas':                'NAS/SAN',
    'san':                'NAS/SAN',
    'monitor':            'Monitor',
    'phone':              'Phone',
    'voip':               'Phone',
    'tablet':             'Tablet',
    'mobile':             'Mobile Device',
  }

  function resolveAssetType(configTypeName) {
    if (!configTypeName) return typeMap['Other'] || null
    const lower = configTypeName.toLowerCase()
    for (const [key, typeName] of Object.entries(CONFIG_TYPE_MAP)) {
      if (lower.includes(key)) return typeMap[typeName] || typeMap['Other'] || null
    }
    return typeMap['Other'] || null
  }

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'assets', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'it_glue'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // ─── Fetch configurations (paginated) ─────────────────────────────────
    console.log('[it-glue-sync] Fetching configurations...')
    let allConfigs = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      try {
        const res = await client.get('/configurations', {
          params: {
            'filter[organization-status-id]': ACTIVE_ORG_STATUS_ID,
            'filter[organization-type-id]': CUSTOMER_ORG_TYPE_ID,
            'filter[active]': 1,
            'page[number]': page,
            'page[size]': 200,
          },
        })

        const items = res.data?.data || []
        allConfigs = allConfigs.concat(items)
        hasMore = items.length === 200
        page++

        console.log(`[it-glue-sync] Page ${page - 1}: ${items.length} configs (total: ${allConfigs.length})`)
      } catch (pageErr) {
        // Handle rate limiting (429)
        if (pageErr.response?.status === 429) {
          const retryAfter = parseInt(pageErr.response.headers['retry-after'] || '5', 10)
          console.log(`[it-glue-sync] Rate limited, waiting ${retryAfter}s...`)
          await new Promise(r => setTimeout(r, retryAfter * 1000))
          continue // retry same page
        }
        throw pageErr
      }

      // Rate limit protection (IT Glue has strict limits)
      await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[it-glue-sync] Fetched ${allConfigs.length} configurations total`)

    // ─── Build org name cache from configs ────────────────────────────────
    // IT Glue configs contain organization info in relationships/attributes
    const orgClientMap = {} // org ID → align client_id
    for (const config of allConfigs) {
      const orgId = config.attributes?.['organization-id']
      if (orgId && !orgClientMap[orgId]) {
        const orgName = config.attributes?.['organization-name']
        const clientId = findClient(orgName)
        if (clientId) orgClientMap[orgId] = clientId
      }
    }

    // ─── Upsert configurations into assets ────────────────────────────────
    let created = 0, updated = 0, skipped = 0, markedInactive = 0

    for (const config of allConfigs) {
      const attrs = config.attributes || {}
      const orgId = attrs['organization-id']
      const clientId = orgClientMap[orgId]
      if (!clientId) { skipped++; continue }

      const configId = parseInt(config.id, 10)
      if (!configId) { skipped++; continue }

      // ── Orphan detection ──────────────────────────────────────────────
      // sync-active=false means IT Glue is no longer syncing this config
      // from Datto RMM — device was decommissioned or removed from management.
      // psa-integration may be 'enabled', null, or 'orphaned' depending on
      // IT Glue version; rely only on sync-active=false as the signal.
      const syncActive = attrs['sync-active']
      const isOrphaned = syncActive === false

      if (isOrphaned) {
        // Mark existing asset inactive (only if it has no Datto RMM ID — don't
        // override an active RMM device that happens to share this ITG config)
        await db.query(
          `UPDATE assets SET is_active = false, updated_at = NOW()
           WHERE tenant_id = $1 AND it_glue_config_id = $2
             AND datto_rmm_device_id IS NULL`,
          [tenantId, configId]
        )
        markedInactive++
        skipped++
        continue
      }

      const assetTypeId = resolveAssetType(attrs['configuration-type-name'])

      // Validate IP
      const ipRaw = attrs['primary-ip'] || null
      const ipAddress = ipRaw && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipRaw) ? ipRaw : null

      const purchaseDateRaw = attrs['installed-at'] || attrs['purchased-at'] || null
      const purchaseDate = purchaseDateRaw ? purchaseDateRaw.slice(0, 10) : null
      const warrantyDate = attrs['warranty-expires-at'] ? attrs['warranty-expires-at'].slice(0, 10) : null

      const upsertResult = await upsertItGlueAsset({
        tenantId,
        clientId,
        assetTypeId,
        configId,
        name: attrs.name || `Config ${configId}`,
        serial: attrs['serial-number'] || null,
        warrantyDate,
        purchaseDate,
        ipAddress,
        configData: config,
      })

      if (upsertResult.isNew) created++
      else updated++
    }

    console.log(`[it-glue-sync] Marked ${markedInactive} orphaned configs as inactive`)

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, allConfigs.length, created, updated, skipped]
      )
    }

    console.log(`[it-glue-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total: allConfigs.length, created, updated, skipped }
  } catch (err) {
    console.error('[it-glue-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncItGlue }
