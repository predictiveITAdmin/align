/**
 * Autotask PSA Sync Service
 *
 * Syncs active customer companies from Autotask into Align's clients table.
 * Autotask Company ID is the canonical client identifier across all APIs.
 */

const axios = require('axios')
const db = require('../db')

// ─── Autotask API client ─────────────────────────────────────────────────────

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

// ─── Get Company Type picklist to find "Customer" value ──────────────────────

let customerTypeId = null

async function getCustomerTypeId(client) {
  if (customerTypeId) return customerTypeId

  const res = await client.get('/Companies/entityInformation/fields')
  const fields = res.data?.fields || []
  const typeField = fields.find(f => f.name === 'companyType')

  if (typeField?.picklistValues) {
    const customer = typeField.picklistValues.find(
      v => v.label.toLowerCase() === 'customer' && v.isActive
    )
    if (customer) {
      customerTypeId = customer.value
      console.log(`[autotask-sync] Customer type ID: ${customerTypeId}`)
    }
  }

  return customerTypeId
}

// ─── Sync active customer companies ──────────────────────────────────────────

async function syncClients(tenantId) {
  const client = buildClient()
  const typeId = await getCustomerTypeId(client)

  if (!typeId) {
    throw new Error('Could not determine Autotask "Customer" company type ID')
  }

  // Log sync start
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
    // Query active customer companies
    const query = {
      filter: [
        { field: 'isActive', op: 'eq', value: true },
        { field: 'companyType', op: 'eq', value: typeId },
      ],
      maxRecords: 500,
      IncludeFields: [
        'id', 'companyName', 'phone', 'webAddress',
        'address1', 'address2', 'city', 'state', 'postalCode', 'countryID',
        'isActive', 'companyType', 'createDate', 'lastActivityDate',
      ],
    }

    const res = await client.post('/Companies/query', query)
    const companies = res.data?.items || []
    console.log(`[autotask-sync] Fetched ${companies.length} active customer companies`)

    let created = 0
    let updated = 0

    for (const company of companies) {
      const result = await db.query(
        `INSERT INTO clients (
          tenant_id, name, autotask_company_id, website,
          address_line1, address_line2, city, state, postal_code,
          phone, is_active, metadata, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (tenant_id, autotask_company_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          website = EXCLUDED.website,
          address_line1 = EXCLUDED.address_line1,
          address_line2 = EXCLUDED.address_line2,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_code = EXCLUDED.postal_code,
          phone = EXCLUDED.phone,
          is_active = EXCLUDED.is_active,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
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
          JSON.stringify(company),
        ]
      )

      if (result.rows[0]?.is_insert) created++
      else updated++
    }

    // Update sync log
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET
          status = 'completed',
          completed_at = NOW(),
          records_fetched = $2,
          records_created = $3,
          records_updated = $4
        WHERE id = $1`,
        [syncLogId, companies.length, created, updated]
      )
    }

    console.log(`[autotask-sync] Done: ${created} created, ${updated} updated`)
    return { total: companies.length, created, updated }
  } catch (err) {
    console.error('[autotask-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncClients }
