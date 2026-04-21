/**
 * Autotask ConfigurationItems → Assets sync.
 *
 * Pulls active ConfigurationItems from Autotask and upserts into assets table.
 * Maps Autotask config types to Align asset types.
 */

const axios = require('axios')
const db = require('../db')
const { upsertAutotaskAsset } = require('../lib/assetUpsert')

function buildClient() {
  const zone = process.env.AUTOTASK_ZONE || 'webservices1'
  return axios.create({
    baseURL: `https://${zone}.autotask.net/ATServicesRest/V1.0`,
    headers: {
      ApiIntegrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
      UserName:           process.env.AUTOTASK_API_USER,
      Secret:             process.env.AUTOTASK_API_SECRET,
      'Content-Type':     'application/json',
    },
  })
}

// Map Autotask RMM device types to our asset types
const TYPE_MAP = {
  'Desktop':     'Workstation',
  'Laptop':      'Laptop',
  'Server':      'Server',
  'Printer':     'Printer',
  'Network':     'Router',
  'Firewall':    'Firewall',
  'Switch':      'Switch',
  'Wireless':    'Access Point',
  'Virtual':     'Virtual Machine',
  'UPS':         'UPS',
  'NAS':         'NAS/SAN',
  'Monitor':     'Monitor',
}

async function syncAssets(tenantId) {
  const client = buildClient()

  // Get our client mapping (autotask_company_id → align client_id)
  const clientMap = {}
  const clients = await db.query(
    `SELECT id, autotask_company_id FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
    [tenantId]
  )
  for (const c of clients.rows) clientMap[c.autotask_company_id] = c.id

  // Get asset type mapping
  const typeMap = {}
  const types = await db.query(`SELECT id, name FROM asset_types WHERE tenant_id = $1`, [tenantId])
  for (const t of types.rows) typeMap[t.name] = t.id

  // Fetch CI field picklists for hardware audit ID resolution
  let picklistMap = {}
  try {
    const fieldsRes = await client.get('/ConfigurationItems/entityInformation/fields')
    for (const f of (fieldsRes.data?.fields || [])) {
      if (f.picklistValues?.length) {
        picklistMap[f.name] = {}
        for (const v of f.picklistValues) picklistMap[f.name][String(v.value)] = v.label
      }
    }
    console.log(`[autotask-asset-sync] Loaded picklists for ${Object.keys(picklistMap).length} fields`)
  } catch (err) {
    console.warn('[autotask-asset-sync] Could not load picklists:', err.message)
  }
  function resolve(field, id) {
    if (id === null || id === undefined) return null
    return picklistMap[field]?.[String(id)] || null
  }

  // Log sync start
  await ensureSyncSource(tenantId)
  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'assets', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'autotask'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // Load which CI types are enabled for sync
    const enabledTypesResult = await db.query(
      `SELECT ci_type_id, maps_to_asset_type_id FROM autotask_ci_sync_types
       WHERE tenant_id = $1 AND is_synced = true`,
      [tenantId]
    )
    // Coerce to Number — Autotask sends numeric type IDs; postgres integer may deserialize differently
    const enabledTypeIds = new Set(enabledTypesResult.rows.map(r => Number(r.ci_type_id)))
    const ciTypeAssetMap = {}  // ci_type_id → asset_type_id override
    for (const r of enabledTypesResult.rows) {
      if (r.maps_to_asset_type_id) ciTypeAssetMap[Number(r.ci_type_id)] = r.maps_to_asset_type_id
    }
    // Distinguish "not configured" (empty table) vs "everything disabled" (table has rows but none enabled)
    const totalConfigured = await db.query(
      `SELECT COUNT(*) FROM autotask_ci_sync_types WHERE tenant_id = $1`, [tenantId]
    )
    const hasFilter = parseInt(totalConfigured.rows[0].count) > 0
    console.log(`[autotask-asset-sync] CI filter: ${hasFilter ? `${enabledTypeIds.size}/${totalConfigured.rows[0].count} types enabled` : 'no filter configured — syncing all types'}`)

    // Query active ConfigurationItems — paginated (Autotask max 500 per request)
    let allItems = []
    let hasMore = true
    let pageNum = 0

    while (hasMore) {
      const query = {
        filter: [
          { field: 'isActive', op: 'eq', value: true },
        ],
        maxRecords: 500,
        IncludeFields: [
          'id', 'companyID', 'referenceTitle', 'rmmDeviceAuditHostname',
          'serialNumber', 'installDate', 'warrantyExpirationDate',
          'rmmDeviceAuditManufacturerID', 'rmmDeviceAuditModelID',
          'rmmDeviceAuditDeviceTypeID', 'rmmDeviceAuditOperatingSystem',
          'rmmDeviceAuditMemoryBytes', 'rmmDeviceAuditStorageBytes',
          'rmmDeviceAuditIPAddress', 'rmmDeviceAuditMacAddress',
          'rmmDeviceAuditProcessorID', 'rmmDeviceAuditMotherboardID',
          'rmmDeviceAuditDisplayAdaptorID', 'rmmDeviceAuditLastUser',
          'rmmDeviceAuditArchitectureID', 'rmmDeviceAuditServicePackID',
          'configurationItemType', 'isActive', 'createDate', 'lastModifiedTime',
          'dailyCost', 'monthlyCost',
        ],
      }

      if (allItems.length > 0) {
        // Autotask pagination: filter by id > last id
        const lastId = allItems[allItems.length - 1].id
        query.filter.push({ field: 'id', op: 'gt', value: lastId })
      }

      const res = await client.post('/ConfigurationItems/query', query)
      const items = res.data?.items || []
      allItems = allItems.concat(items)

      hasMore = items.length === 500
      pageNum++
      console.log(`[autotask-asset-sync] Page ${pageNum}: ${items.length} items (total: ${allItems.length})`)
    }

    console.log(`[autotask-asset-sync] Fetched ${allItems.length} active configuration items`)

    let created = 0, updated = 0, skipped = 0

    for (const item of allItems) {
      const clientId = clientMap[item.companyID]
      if (!clientId) { skipped++; continue }

      // Skip CI types not enabled for sync
      // hasFilter=true means user has configured the table; respect enabled set (even if empty = skip all)
      // hasFilter=false means table is empty = no filter = sync everything
      if (hasFilter && !enabledTypeIds.has(Number(item.configurationItemType))) {
        skipped++; continue
      }

      // Determine asset type — prefer explicit CI-type mapping, fall back to name heuristic
      let assetTypeId = ciTypeAssetMap[Number(item.configurationItemType)] || null
      if (!assetTypeId) {
        const typeName = Object.values(TYPE_MAP).find(v =>
          item.referenceTitle?.toLowerCase().includes(v.toLowerCase())
        ) || 'Other'
        assetTypeId = typeMap[typeName] || typeMap['Other'] || null
      }

      const hostname = item.rmmDeviceAuditHostname || null
      const ipRaw = item.rmmDeviceAuditIPAddress || null
      const ipAddress = ipRaw && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipRaw) ? ipRaw : null
      const macRaw = item.rmmDeviceAuditMacAddress || null
      const macAddress = macRaw && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(macRaw) ? macRaw : null

      // Resolve picklist IDs to human-readable strings
      const manufacturer = resolve('rmmDeviceAuditManufacturerID', item.rmmDeviceAuditManufacturerID)
      const model        = resolve('rmmDeviceAuditModelID', item.rmmDeviceAuditModelID)
      const cpuDesc      = resolve('rmmDeviceAuditProcessorID', item.rmmDeviceAuditProcessorID)
      const motherboard  = resolve('rmmDeviceAuditMotherboardID', item.rmmDeviceAuditMotherboardID)
      const displayAdapt = resolve('rmmDeviceAuditDisplayAdaptorID', item.rmmDeviceAuditDisplayAdaptorID)
      const lastUser     = item.rmmDeviceAuditLastUser || null
      const ramBytes     = item.rmmDeviceAuditMemoryBytes || null
      const storageBytes = item.rmmDeviceAuditStorageBytes || null

      const upsertResult = await upsertAutotaskAsset({
        tenantId,
        clientId,
        assetTypeId,
        ciId: item.id,
        name: item.referenceTitle || hostname || `Asset ${item.id}`,
        serial: item.serialNumber || null,
        os: item.rmmDeviceAuditOperatingSystem || null,
        purchaseDate: item.installDate || null,
        warrantyDate: item.warrantyExpirationDate || null,
        manufacturer,
        model,
        cpuDescription: cpuDesc,
        motherboard,
        displayAdapters: displayAdapt,
        lastUser,
        hostname,
        macAddress,
        ramBytes,
        storageBytes,
        ipAddress,
        ciData: item,
      })

      if (upsertResult.isNew) created++
      else updated++
    }

    // ─── Cross-source hardware push ───────────────────────────────────────
    // Datto RMM's REST API doesn't expose hardware audit data, but Autotask CIs
    // have it (rmmDeviceAuditManufacturerID etc.). After upserting AT CIs, find
    // Datto RMM assets that share a serial number with an AT CI that has hardware
    // data, and push that hardware onto the RMM asset record.
    const hwPushResult = await db.query(
      `UPDATE assets AS rmm
       SET manufacturer    = COALESCE(rmm.manufacturer, at_src.manufacturer),
           model           = COALESCE(rmm.model, at_src.model),
           cpu_description = COALESCE(rmm.cpu_description, at_src.cpu_description),
           cpu_cores       = COALESCE(rmm.cpu_cores, at_src.cpu_cores),
           ram_bytes       = COALESCE(rmm.ram_bytes, at_src.ram_bytes),
           storage_bytes   = COALESCE(rmm.storage_bytes, at_src.storage_bytes),
           motherboard     = COALESCE(rmm.motherboard, at_src.motherboard),
           updated_at      = NOW()
       FROM assets AS at_src
       WHERE rmm.tenant_id            = $1
         AND rmm.datto_rmm_device_id  IS NOT NULL
         AND at_src.autotask_ci_id    IS NOT NULL
         AND rmm.id                   != at_src.id
         AND rmm.client_id            = at_src.client_id
         AND LOWER(TRIM(rmm.serial_number)) = LOWER(TRIM(at_src.serial_number))
         AND LENGTH(TRIM(COALESCE(rmm.serial_number,''))) >= 4
         AND (at_src.manufacturer IS NOT NULL OR at_src.model IS NOT NULL OR at_src.cpu_description IS NOT NULL)
         AND (rmm.manufacturer IS NULL OR rmm.model IS NULL OR rmm.cpu_description IS NULL)`,
      [tenantId]
    )
    if (hwPushResult.rowCount > 0) {
      console.log(`[autotask-asset-sync] Pushed hardware specs to ${hwPushResult.rowCount} Datto RMM assets via serial match`)
    }

    // Update sync log
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, allItems.length, created, updated, skipped]
      )
    }

    console.log(`[autotask-asset-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total: allItems.length, created, updated, skipped }
  } catch (err) {
    console.error('[autotask-asset-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'autotask', 'Autotask PSA', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

module.exports = { syncAssets }
