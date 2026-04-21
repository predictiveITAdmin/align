/**
 * Autotask PSA Sync Service
 *
 * Syncs active company records from Autotask into Align's clients table.
 * Which company types / classifications get synced is controlled by
 * autotask_company_type_filters table (managed via Settings → Client Management).
 *
 * Falls back to Customer-type-only if no filters have been configured.
 */

const axios = require('axios')
const db = require('../db')

// ─── Autotask API client ──────────────────────────────────────────────────────

function buildClient() {
  const zone = process.env.AUTOTASK_ZONE || 'webservices1'
  const baseURL = `https://${zone}.autotask.net/ATServicesRest/V1.0`
  return axios.create({
    baseURL,
    headers: {
      ApiIntegrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
      UserName:           process.env.AUTOTASK_API_USER,
      Secret:             process.env.AUTOTASK_API_SECRET,
      'Content-Type':     'application/json',
    },
  })
}

// ─── Picklist cache ───────────────────────────────────────────────────────────

let _picklists = null

async function getCompanyPicklists(client) {
  if (_picklists) return _picklists
  const res = await client.get('/Companies/entityInformation/fields')
  const fields = res.data?.fields || []
  const RELEVANT = ['companyType', 'classification', 'marketSegmentID']
  _picklists = {}
  for (const fieldName of RELEVANT) {
    const field = fields.find(f => f.name === fieldName)
    if (field?.picklistValues) {
      _picklists[fieldName] = field.picklistValues
        .filter(v => v.isActive !== false)
        .map(v => ({ value: parseInt(v.value), label: v.label }))
    }
  }
  return _picklists
}

// Legacy helper — still used as fallback
async function getCustomerTypeId(client) {
  const picklists = await getCompanyPicklists(client)
  const customerType = picklists.companyType?.find(t => t.label.toLowerCase() === 'customer')
  return customerType?.value || null
}

// ─── Build Autotask query filter from DB settings ─────────────────────────────

async function buildSyncFilter(tenantId, atClient) {
  // Pull enabled values for each relevant field
  const result = await db.query(
    `SELECT field_name, array_agg(picklist_value) AS values
     FROM autotask_company_type_filters
     WHERE tenant_id = $1 AND is_synced = true
     GROUP BY field_name`,
    [tenantId]
  )
  const byField = {}
  for (const row of result.rows) {
    byField[row.field_name] = row.values.map(Number)
  }

  // companyType — fall back to Customer only if nothing configured
  let typeIds = byField.companyType || []
  if (typeIds.length === 0) {
    const customerId = await getCustomerTypeId(atClient)
    if (customerId) typeIds = [customerId]
  }

  // Autotask REST: all items in the filter array are implicitly AND-ed together.
  // Requires Account Type AND Classification (when configured) — not OR.
  const filter = [{ field: 'isActive', op: 'eq', value: true }]

  if (typeIds.length === 1) {
    filter.push({ field: 'companyType', op: 'eq', value: typeIds[0] })
  } else if (typeIds.length > 1) {
    filter.push({ field: 'companyType', op: 'in', value: typeIds })
  }

  // classification — only add if user has selected specific values (AND account type above)
  const classIds = byField.classification || []
  if (classIds.length > 0) {
    filter.push(
      classIds.length === 1
        ? { field: 'classification', op: 'eq', value: classIds[0] }
        : { field: 'classification', op: 'in', value: classIds }
    )
  }

  // marketSegmentID — only add if user has selected specific values
  const segIds = byField.marketSegmentID || []
  if (segIds.length > 0) {
    filter.push(
      segIds.length === 1
        ? { field: 'marketSegmentID', op: 'eq', value: segIds[0] }
        : { field: 'marketSegmentID', op: 'in', value: segIds }
    )
  }

  return filter
}

// ─── Sync active companies ────────────────────────────────────────────────────

async function syncClients(tenantId) {
  const client = buildClient()

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'clients', 'running', NOW()
     FROM sync_sources
     WHERE tenant_id = $1 AND source_type = 'autotask'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    const filter = await buildSyncFilter(tenantId, client)
    console.log('[autotask-sync] Filter:', JSON.stringify(filter))

    const query = {
      filter,
      maxRecords: 500,
      IncludeFields: [
        'id', 'companyName', 'phone', 'webAddress',
        'address1', 'address2', 'city', 'state', 'postalCode', 'countryID',
        'isActive', 'companyType', 'classification', 'marketSegmentID',
        'createDate', 'lastActivityDate',
      ],
    }

    const res = await client.post('/Companies/query', query)
    const companies = res.data?.items || []
    console.log(`[autotask-sync] Fetched ${companies.length} companies`)

    // Get picklists so we can resolve labels for account_type column
    const picklists = await getCompanyPicklists(client)

    let created = 0, updated = 0

    for (const company of companies) {
      // Resolve human-readable account_type from companyType picklist value
      const typeLabel = picklists.companyType?.find(t => t.value === company.companyType)?.label || null
      const classLabel = picklists.classification?.find(c => c.value === company.classification)?.label || null

      const result = await db.query(
        `INSERT INTO clients (
          tenant_id, name, autotask_company_id, website,
          address_line1, address_line2, city, state, postal_code,
          phone, is_active, account_type, metadata, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (tenant_id, autotask_company_id)
        DO UPDATE SET
          name            = EXCLUDED.name,
          website         = EXCLUDED.website,
          address_line1   = EXCLUDED.address_line1,
          address_line2   = EXCLUDED.address_line2,
          city            = EXCLUDED.city,
          state           = EXCLUDED.state,
          postal_code     = EXCLUDED.postal_code,
          phone           = EXCLUDED.phone,
          is_active       = EXCLUDED.is_active,
          account_type    = EXCLUDED.account_type,
          metadata        = EXCLUDED.metadata,
          last_synced_at  = NOW(),
          updated_at      = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          company.companyName,
          company.id,
          company.webAddress || null,
          company.address1 || null,
          company.address2 || null,
          company.city || null,
          company.state || null,
          company.postalCode || null,
          company.phone || null,
          company.isActive,
          typeLabel,  // stored as account_type so UI can display it
          JSON.stringify({ ...company, _classLabel: classLabel }),
        ]
      )

      // Map Autotask classification → tenant vertical (if mapping exists)
      if (classLabel) {
        await db.query(
          `UPDATE clients SET vertical = (
            SELECT slug FROM tenant_verticals
            WHERE tenant_id = $1 AND autotask_classification = $2 AND is_active = true
            LIMIT 1
          ) WHERE tenant_id = $1 AND autotask_company_id = $3 AND vertical IS NULL`,
          [tenantId, classLabel, String(company.id)]
        )
      }
      if (result.rows[0]?.is_insert) created++
      else updated++
    }

    // Prune: disable sync for any previously-synced client no longer returned
    // by the current filter (e.g. account type changed, classification no longer matches)
    const returnedIds = companies.map(c => String(c.id))
    const pruneResult = await db.query(
      `UPDATE clients
         SET sync_enabled = false, updated_at = NOW()
       WHERE tenant_id = $1
         AND autotask_company_id IS NOT NULL
         AND autotask_company_id::text != ALL($2::text[])
         AND sync_enabled = true`,
      [tenantId, returnedIds]
    )
    const pruned = pruneResult.rowCount || 0
    if (pruned > 0) {
      console.log(`[autotask-sync] Pruned ${pruned} clients no longer matching filter`)
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status='completed', completed_at=NOW(),
          records_fetched=$2, records_created=$3, records_updated=$4
         WHERE id=$1`,
        [syncLogId, companies.length, created, updated]
      )
    }

    console.log(`[autotask-sync] Done: ${created} created, ${updated} updated, ${pruned} pruned`)
    return { total: companies.length, created, updated, pruned }
  } catch (err) {
    console.error('[autotask-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status='failed', completed_at=NOW(), error_message=$2 WHERE id=$1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

module.exports = { syncClients, getCompanyPicklists, buildClient }
