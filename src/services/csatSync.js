/**
 * Customer Thermometer → CSAT sync.
 *
 * Pulls survey responses from Customer Thermometer API and upserts into csat_responses.
 * Maps company names to Align clients.
 */

const axios = require('axios')
const { parseString } = require('xml2js')
const db = require('../db')

const CT_BASE = 'https://app.customerthermometer.com/api.php'
const CT_API_KEY = process.env.CUSTOMER_THERMOMETER_API_KEY

// Temperature ID → rating enum
const RATING_MAP = { '1': 'gold', '2': 'green', '3': 'yellow', '4': 'red' }

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

async function syncCSAT(tenantId) {
  if (!CT_API_KEY) throw new Error('Customer Thermometer API key not configured')

  // Ensure sync source
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'customer_thermometer', 'Customer Thermometer', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'csat_responses', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'customer_thermometer'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // Fetch all blast results
    const res = await axios.get(CT_BASE, {
      params: {
        apiKey: CT_API_KEY,
        getMethod: 'getBlastResults',
        limit: 100000,
        showNull: 'true',
      },
    })

    const parsed = await parseXml(res.data)
    const responses = parsed?.thermometer_blast_responses?.thermometer_blast_response || []
    const responseList = Array.isArray(responses) ? responses : [responses]

    console.log(`[csat-sync] Fetched ${responseList.length} responses from Customer Thermometer`)

    // Build client name → id lookup (fuzzy matching)
    const clients = await db.query(
      `SELECT id, name, LOWER(name) as lower_name FROM clients WHERE tenant_id = $1`,
      [tenantId]
    )
    const clientLookup = {}
    for (const c of clients.rows) clientLookup[c.lower_name] = c.id

    function findClientId(companyName) {
      if (!companyName) return null
      const lower = companyName.toLowerCase().trim()

      // Exact match
      if (clientLookup[lower]) return clientLookup[lower]

      // Partial match — check if response company name starts with or contains a client name
      for (const [clientName, id] of Object.entries(clientLookup)) {
        if (lower.includes(clientName) || clientName.includes(lower)) return id
      }
      return null
    }

    let created = 0, updated = 0

    for (const r of responseList) {
      const externalId = r.response_id
      if (!externalId) continue

      const clientId = findClientId(r.company)
      const rating = RATING_MAP[r.temperature_id] || 'green'

      const result = await db.query(
        `INSERT INTO csat_responses (
          tenant_id, client_id, rating, comment,
          respondent_email, respondent_name,
          ticket_number, technician_name,
          responded_at, external_id, external_source, metadata, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'customer_thermometer',$11,NOW())
        ON CONFLICT (tenant_id, external_source, external_id)
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          rating = EXCLUDED.rating,
          comment = EXCLUDED.comment,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          rating,
          r.comment || null,
          r.recipient || null,
          [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
          r.custom_1 || null,  // Autotask ticket number
          r.custom_3 || null,  // Technician name
          r.response_date || null,
          externalId,
          JSON.stringify(r),
        ]
      )

      if (result.rows[0]?.is_insert) created++
      else updated++
    }

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4
         WHERE id = $1`,
        [syncLogId, responseList.length, created, updated]
      )
    }

    console.log(`[csat-sync] Done: ${created} created, ${updated} updated`)
    return { total: responseList.length, created, updated }
  } catch (err) {
    console.error('[csat-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncCSAT }
