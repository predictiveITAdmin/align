/**
 * Autotask ConfigurationItems → Assets sync.
 *
 * Pulls active ConfigurationItems from Autotask and upserts into assets table.
 * Maps Autotask config types to Align asset types.
 */

const axios = require('axios')
const db = require('../db')

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

      // Determine asset type
      const typeName = Object.values(TYPE_MAP).find(v =>
        item.referenceTitle?.toLowerCase().includes(v.toLowerCase())
      ) || 'Other'
      const assetTypeId = typeMap[typeName] || typeMap['Other'] || null

      const result = await db.query(
        `INSERT INTO assets (
          tenant_id, client_id, asset_type_id, name, hostname,
          serial_number, manufacturer, model, operating_system,
          warranty_expiry, installed_at, is_active,
          external_id, external_source, metadata, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'autotask',$14,NOW())
        ON CONFLICT (tenant_id, external_source, external_id)
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          asset_type_id = EXCLUDED.asset_type_id,
          name = EXCLUDED.name,
          hostname = EXCLUDED.hostname,
          serial_number = EXCLUDED.serial_number,
          warranty_expiry = EXCLUDED.warranty_expiry,
          is_active = EXCLUDED.is_active,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          assetTypeId,
          item.referenceTitle || item.rmmDeviceAuditHostname || `Asset ${item.id}`,
          item.rmmDeviceAuditHostname || null,
          item.serialNumber || null,
          null, // manufacturer — would need picklist lookup
          null, // model — would need picklist lookup
          item.rmmDeviceAuditOperatingSystem || null,
          item.warrantyExpirationDate || null,
          item.installDate || null,
          item.isActive,
          String(item.id),
          JSON.stringify(item),
        ]
      )

      if (result.rows[0]?.is_insert) created++
      else updated++
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
