/**
 * ScalePad LMX Sync Service.
 *
 * Imports assessment templates as standards, assessments with scores,
 * and initiatives as recommendations from ScalePad Lifecycle Manager.
 */

const axios = require('axios')
const db = require('../db')

const SCALEPAD_BASE = 'https://api.scalepad.com'

function buildClient() {
  return axios.create({
    baseURL: SCALEPAD_BASE,
    headers: {
      'x-api-key': process.env.SCALEPAD_API_KEY,
      'Content-Type': 'application/json',
    },
  })
}

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'scalepad', 'ScalePad LMX', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

// Cursor-based pagination helper
async function fetchAllCursor(client, path, pageSize = 100) {
  let all = []
  let cursor = null
  let hasMore = true

  while (hasMore) {
    const params = { page_size: pageSize }
    if (cursor) params.cursor = cursor

    const res = await client.get(path, { params })
    const data = res.data
    const items = data?.data || data?.items || []
    const list = Array.isArray(items) ? items : []
    all = all.concat(list)

    cursor = data?.next_cursor || data?.pagination?.next_cursor || null
    hasMore = !!cursor && list.length > 0

    // Rate limit protection
    if (hasMore) await new Promise(r => setTimeout(r, 200))
  }

  return all
}

async function syncScalePad(tenantId) {
  if (!process.env.SCALEPAD_API_KEY) {
    throw new Error('ScalePad API key not configured')
  }

  const client = buildClient()

  await ensureSyncSource(tenantId)

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'standards', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'scalepad'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // Build client mapping: autotask_company_id → align client_id
    const clientMap = {}
    const clientsResult = await db.query(
      `SELECT id, autotask_company_id, name FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
      [tenantId]
    )
    for (const c of clientsResult.rows) clientMap[c.autotask_company_id] = c.id

    // Also build ScalePad client.id → align client_id via name matching as fallback
    const clientNameMap = {}
    const allClients = await db.query(
      `SELECT id, name, LOWER(name) as lower_name FROM clients WHERE tenant_id = $1`,
      [tenantId]
    )
    for (const c of allClients.rows) clientNameMap[c.lower_name] = c.id

    function findClientByName(name) {
      if (!name) return null
      const lower = name.toLowerCase().trim()
      if (clientNameMap[lower]) return clientNameMap[lower]
      for (const [clientName, id] of Object.entries(clientNameMap)) {
        if (lower.includes(clientName) || clientName.includes(lower)) return id
      }
      return null
    }

    // ─── Phase 1: Import assessment templates as standards ────────────────
    console.log('[scalepad-sync] Fetching assessment templates...')
    const templates = await fetchAllCursor(client, '/lifecycle-manager/v1/assessment-templates')
    console.log(`[scalepad-sync] Fetched ${templates.length} assessment templates`)

    // Ensure a ScalePad category exists
    const catResult = await db.query(
      `INSERT INTO standard_categories (tenant_id, name, description)
       VALUES ($1, 'Lifecycle Management', 'Standards imported from ScalePad LMX')
       ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenantId]
    )
    const categoryId = catResult.rows[0].id

    let standardsCreated = 0, standardsUpdated = 0

    for (const tmpl of templates) {
      const externalId = tmpl.id?.toString()
      if (!externalId) continue

      const result = await db.query(
        `INSERT INTO standards (
          tenant_id, category_id, name, description,
          external_id, external_source, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'scalepad', $6)
        ON CONFLICT (tenant_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          categoryId,
          tmpl.title || tmpl.name || `Template ${externalId}`,
          tmpl.description || null,
          externalId,
          JSON.stringify(tmpl),
        ]
      )

      if (result.rows[0]?.is_insert) standardsCreated++
      else standardsUpdated++
    }

    console.log(`[scalepad-sync] Standards: ${standardsCreated} created, ${standardsUpdated} updated`)

    // ─── Phase 2: Import assessments ──────────────────────────────────────
    console.log('[scalepad-sync] Fetching assessments...')
    const assessments = await fetchAllCursor(client, '/lifecycle-manager/v1/assessments')
    console.log(`[scalepad-sync] Fetched ${assessments.length} assessments`)

    let assessCreated = 0, assessUpdated = 0, assessSkipped = 0

    for (const assess of assessments) {
      // Map to client via ScalePad client → Autotask company ID
      let clientId = null
      const spClientId = assess.client?.id || assess.clientId
      const autotaskId = assess.client?.source_record_id || assess.source_record_id
      if (autotaskId && clientMap[autotaskId]) {
        clientId = clientMap[autotaskId]
      } else {
        clientId = findClientByName(assess.client?.name || assess.clientName)
      }

      if (!clientId) { assessSkipped++; continue }

      const externalId = assess.id?.toString()
      if (!externalId) { assessSkipped++; continue }

      const result = await db.query(
        `INSERT INTO assessments (
          tenant_id, client_id, name,
          assessment_date, overall_score, summary, status,
          external_id, external_source, metadata, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, 'scalepad', $8, NOW())
        ON CONFLICT (tenant_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          overall_score = EXCLUDED.overall_score,
          summary = EXCLUDED.summary,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          assess.title || assess.name || `ScalePad Assessment`,
          assess.completedAt || assess.created_at || new Date().toISOString().slice(0, 10),
          assess.score || assess.overallScore || null,
          assess.summary || null,
          externalId,
          JSON.stringify(assess),
        ]
      )

      if (result.rows[0]?.is_insert) assessCreated++
      else assessUpdated++
    }

    console.log(`[scalepad-sync] Assessments: ${assessCreated} created, ${assessUpdated} updated, ${assessSkipped} skipped`)

    // ─── Phase 3: Import initiatives as recommendations ───────────────────
    console.log('[scalepad-sync] Fetching initiatives...')
    const initiatives = await fetchAllCursor(client, '/lifecycle-manager/v1/initiatives')
    console.log(`[scalepad-sync] Fetched ${initiatives.length} initiatives`)

    let recsCreated = 0, recsUpdated = 0, recsSkipped = 0

    for (const init of initiatives) {
      let clientId = null
      const autotaskId = init.client?.source_record_id || init.source_record_id
      if (autotaskId && clientMap[autotaskId]) {
        clientId = clientMap[autotaskId]
      } else {
        clientId = findClientByName(init.client?.name || init.clientName)
      }

      if (!clientId) { recsSkipped++; continue }

      const externalId = init.id?.toString()
      if (!externalId) { recsSkipped++; continue }

      // Map ScalePad priority to recommendation_priority
      const priorityStr = (init.priority || '').toLowerCase()
      let priority = 'medium'
      if (priorityStr.includes('critical') || priorityStr.includes('urgent')) priority = 'critical'
      else if (priorityStr.includes('high')) priority = 'high'
      else if (priorityStr.includes('low')) priority = 'low'

      const result = await db.query(
        `INSERT INTO recommendations (
          tenant_id, client_id, title, description,
          priority, type, status,
          estimated_budget, target_date,
          external_id, external_source, metadata, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, 'strategic', 'draft', $6, $7, $8, 'scalepad', $9, NOW())
        ON CONFLICT (tenant_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          priority = EXCLUDED.priority,
          estimated_budget = EXCLUDED.estimated_budget,
          target_date = EXCLUDED.target_date,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          init.title || init.name || `Initiative ${externalId}`,
          init.description || null,
          priority,
          init.budget || init.estimatedBudget || null,
          init.targetDate || init.dueDate || null,
          externalId,
          JSON.stringify(init),
        ]
      )

      if (result.rows[0]?.is_insert) recsCreated++
      else recsUpdated++
    }

    console.log(`[scalepad-sync] Initiatives→Recs: ${recsCreated} created, ${recsUpdated} updated, ${recsSkipped} skipped`)

    const total = templates.length + assessments.length + initiatives.length
    const created = standardsCreated + assessCreated + recsCreated
    const updated = standardsUpdated + assessUpdated + recsUpdated
    const skipped = assessSkipped + recsSkipped

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, total, created, updated, skipped]
      )
    }

    console.log(`[scalepad-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total, created, updated, skipped }
  } catch (err) {
    console.error('[scalepad-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncScalePad }
