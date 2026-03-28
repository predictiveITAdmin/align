/**
 * SaaS Alerts License Sync Service.
 *
 * Pulls customer organizations and per-user license data from SaaS Alerts.
 * Maps customers to clients via PSA mapping (Autotask company ID).
 * Upserts into saas_licenses table.
 */

const axios = require('axios')
const db = require('../db')

const SA_BASE = 'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1'

function buildClient() {
  return axios.create({
    baseURL: SA_BASE,
    headers: {
      api_key: process.env.SAASALERTS_API_KEY,
      'Content-Type': 'application/json',
    },
  })
}

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'saas_alerts', 'SaaS Alerts', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

async function syncSaasAlerts(tenantId) {
  if (!process.env.SAASALERTS_API_KEY) {
    throw new Error('SaaS Alerts API key not configured')
  }

  const client = buildClient()

  await ensureSyncSource(tenantId)

  // Build client mapping: autotask_company_id → align client_id
  const clientMap = {}
  const clientsResult = await db.query(
    `SELECT id, autotask_company_id FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
    [tenantId]
  )
  for (const c of clientsResult.rows) clientMap[String(c.autotask_company_id)] = c.id

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'saas_licenses', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'saas_alerts'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // ─── Fetch all customers ──────────────────────────────────────────────
    console.log('[saas-alerts-sync] Fetching customers...')
    const custRes = await client.get('/customers')
    const customers = custRes.data || []
    console.log(`[saas-alerts-sync] Fetched ${customers.length} customers`)

    // Map SaaS Alerts customer → Align client via PSA mapping
    const customerClientMap = {} // SaaS Alerts customer ID → align client_id
    for (const cust of customers) {
      const custId = cust.id || cust.customerId
      if (!custId) continue

      // Check mappedToPSA for Autotask company ID
      const psaMappings = cust.mappedToPSA || []
      for (const mapping of psaMappings) {
        const atId = String(mapping.mappedTo || mapping.id || '')
        if (atId && clientMap[atId]) {
          customerClientMap[custId] = clientMap[atId]
          break
        }
      }
    }

    console.log(`[saas-alerts-sync] Matched ${Object.keys(customerClientMap).length}/${customers.length} customers to clients`)

    // ─── Fetch users per customer ─────────────────────────────────────────
    let totalLicenses = 0
    let created = 0, updated = 0, skipped = 0

    for (const cust of customers) {
      const custId = cust.id || cust.customerId
      if (!custId) continue

      const clientId = customerClientMap[custId]
      if (!clientId) { continue }

      try {
        const usersRes = await client.get('/reports/users', {
          params: { customerId: custId },
        })
        const users = usersRes.data || []

        for (const user of users) {
          const email = user.email || user.userPrincipalName
          if (!email) continue

          const licenses = user.assignedLicenses || []
          if (licenses.length === 0 && !user.isLicensed) continue

          // Create a license entry for each assigned license
          if (licenses.length > 0) {
            for (const lic of licenses) {
              const licenseName = lic.skuPartNumber || lic.skuId || 'Unknown License'
              const externalId = `${custId}:${email}:${lic.skuId || licenseName}`

              const result = await db.query(
                `INSERT INTO saas_licenses (
                  tenant_id, client_id, user_email, user_display_name,
                  platform, license_name, license_sku,
                  is_active, external_id, metadata, last_synced_at
                ) VALUES ($1,$2,$3,$4,'microsoft_365',$5,$6,$7,$8,$9,NOW())
                ON CONFLICT (tenant_id, client_id, user_email, platform, license_name)
                DO UPDATE SET
                  user_display_name = EXCLUDED.user_display_name,
                  license_sku = EXCLUDED.license_sku,
                  is_active = EXCLUDED.is_active,
                  external_id = EXCLUDED.external_id,
                  metadata = EXCLUDED.metadata,
                  last_synced_at = NOW(),
                  updated_at = NOW()
                RETURNING (xmax = 0) AS is_insert`,
                [
                  tenantId,
                  clientId,
                  email.toLowerCase(),
                  user.displayName || user.name || null,
                  licenseName,
                  lic.skuId || null,
                  user.isLicensed !== false && (lic.isActive !== false),
                  externalId,
                  JSON.stringify({
                    customerId: custId,
                    isLicensed: user.isLicensed,
                    isBillable: user.isBillable,
                    assignedLicense: lic,
                  }),
                ]
              )

              totalLicenses++
              if (result.rows[0]?.is_insert) created++
              else updated++
            }
          } else {
            // User is licensed but no specific license details
            const externalId = `${custId}:${email}:general`
            const result = await db.query(
              `INSERT INTO saas_licenses (
                tenant_id, client_id, user_email, user_display_name,
                platform, license_name,
                is_active, external_id, metadata, last_synced_at
              ) VALUES ($1,$2,$3,$4,'microsoft_365','M365 License',true,$5,$6,NOW())
              ON CONFLICT (tenant_id, client_id, user_email, platform, license_name)
              DO UPDATE SET
                user_display_name = EXCLUDED.user_display_name,
                is_active = EXCLUDED.is_active,
                metadata = EXCLUDED.metadata,
                last_synced_at = NOW(),
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_insert`,
              [
                tenantId,
                clientId,
                email.toLowerCase(),
                user.displayName || user.name || null,
                externalId,
                JSON.stringify({
                  customerId: custId,
                  isLicensed: user.isLicensed,
                  isBillable: user.isBillable,
                }),
              ]
            )

            totalLicenses++
            if (result.rows[0]?.is_insert) created++
            else updated++
          }
        }
      } catch (userErr) {
        // Handle rate limiting
        if (userErr.response?.status === 429) {
          const retryAfter = parseInt(userErr.response.headers['retry-after'] || '10', 10)
          console.log(`[saas-alerts-sync] Rate limited, waiting ${retryAfter}s...`)
          await new Promise(r => setTimeout(r, retryAfter * 1000))
          // Skip this customer on rate limit (will be caught next sync)
          skipped++
          continue
        }
        console.warn(`[saas-alerts-sync] Failed to fetch users for customer ${custId}: ${userErr.message}`)
        skipped++
      }

      // Rate limit protection
      await new Promise(r => setTimeout(r, 300))
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, totalLicenses, created, updated, skipped]
      )
    }

    console.log(`[saas-alerts-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total: totalLicenses, created, updated, skipped }
  } catch (err) {
    console.error('[saas-alerts-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncSaasAlerts }
