/**
 * Autotask Contacts Sync Service
 *
 * Syncs active contacts from Autotask into the client_contacts table.
 * Queries per managed client to avoid pagination issues with large result sets.
 */

const axios = require('axios')
const db = require('../db')

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

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'autotask', 'Autotask PSA', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

async function upsertContact(contact, tenantId, clientId) {
  const externalId = String(contact.id)
  const firstName = contact.firstName || ''
  const lastName = contact.lastName || ''
  if (!firstName && !lastName) return false

  const result = await db.query(
    `INSERT INTO client_contacts (
      tenant_id, client_id, first_name, last_name,
      title, email, phone, mobile_phone,
      is_primary, is_active,
      external_id, external_source, metadata, last_synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'autotask',$12,NOW())
    ON CONFLICT (external_source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      client_id = EXCLUDED.client_id,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      title = EXCLUDED.title,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      mobile_phone = EXCLUDED.mobile_phone,
      is_primary = EXCLUDED.is_primary,
      is_active = EXCLUDED.is_active,
      metadata = EXCLUDED.metadata,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert`,
    [
      tenantId,
      clientId,
      firstName,
      lastName,
      contact.title || null,
      contact.emailAddress || null,
      contact.phone || null,
      contact.mobilePhone || null,
      contact.isPrimaryContact === true,
      true,
      externalId,
      JSON.stringify({
        autotaskId: contact.id,
        companyId: contact.companyID,
        additionalEmails: [contact.emailAddress2, contact.emailAddress3].filter(Boolean),
        alternatePhone: contact.alternatePhone || null,
      }),
    ]
  )
  return result.rows[0]?.is_insert
}

async function syncContacts(tenantId) {
  if (!process.env.AUTOTASK_API_USER) {
    throw new Error('Autotask credentials not configured')
  }

  const client = buildClient()
  await ensureSyncSource(tenantId)

  // Get all managed clients with Autotask IDs
  const clientsResult = await db.query(
    `SELECT id, autotask_company_id, name FROM clients
     WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL AND classification = 'managed'`,
    [tenantId]
  )

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'contacts', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'autotask'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  let created = 0, updated = 0, skipped = 0

  try {
    console.log(`[contacts-sync] Syncing contacts for ${clientsResult.rows.length} managed clients...`)

    for (const alignClient of clientsResult.rows) {
      try {
        // Query contacts for this specific company
        const res = await client.post('/Contacts/query', {
          filter: [
            { field: 'companyID', op: 'eq', value: alignClient.autotask_company_id },
            { field: 'isActive', op: 'eq', value: 1 },
          ],
          maxRecords: 500,
        })

        const contacts = res.data?.items || []
        console.log(`[contacts-sync] ${alignClient.name}: ${contacts.length} contacts`)

        for (const contact of contacts) {
          try {
            const isNew = await upsertContact(contact, tenantId, alignClient.id)
            if (isNew === true) created++
            else if (isNew === false) updated++
            else skipped++
          } catch (err) {
            console.warn(`[contacts-sync] Failed to upsert contact ${contact.id}: ${err.message}`)
            skipped++
          }
        }

        // Rate limit protection
        await new Promise(r => setTimeout(r, 100))
      } catch (err) {
        console.warn(`[contacts-sync] Failed to fetch contacts for ${alignClient.name}: ${err.message}`)
        skipped++
      }
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, created + updated + skipped, created, updated, skipped]
      )
    }

    console.log(`[contacts-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total: created + updated + skipped, created, updated, skipped }
  } catch (err) {
    console.error('[contacts-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncContacts }
