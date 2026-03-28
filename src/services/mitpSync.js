/**
 * MyITProcess Standards + Recommendations Sync.
 *
 * Pulls findings and recommendations from MyITProcess API.
 * Imports unique questions as standards, recommendations linked to clients.
 */

const axios = require('axios')
const db = require('../db')

const MITP_BASE = 'https://reporting.live.myitprocess.com/public-api/v1'

function buildClient() {
  return axios.create({
    baseURL: MITP_BASE,
    headers: {
      'mitp-api-key': process.env.MYITPROCESS_API_KEY,
      'Content-Type': 'application/json',
    },
  })
}

// MyITProcess severity → alignment_severity enum
const SEVERITY_MAP = {
  'aligned with best practice': 'aligned',
  'aligned':                    'aligned',
  'marginal':                   'marginal',
  'vulnerable':                 'vulnerable',
  'highly vulnerable':          'highly_vulnerable',
}

function mapSeverity(vcioAnswerType) {
  if (!vcioAnswerType) return 'not_assessed'
  const key = vcioAnswerType.toLowerCase().trim()
  return SEVERITY_MAP[key] || 'not_assessed'
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

async function ensureSyncSource(tenantId) {
  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'myitprocess', 'MyITProcess', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )
}

// Paginated GET helper
async function fetchAllPages(client, path, pageSize = 100) {
  let all = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const res = await client.get(path, {
      params: { page, pageSize },
    })
    const items = res.data?.data || res.data?.items || res.data || []
    const list = Array.isArray(items) ? items : []
    all = all.concat(list)
    hasMore = list.length === pageSize
    page++

    // Rate limit protection
    if (hasMore) await new Promise(r => setTimeout(r, 200))
  }

  return all
}

async function syncMITP(tenantId) {
  if (!process.env.MYITPROCESS_API_KEY) {
    throw new Error('MyITProcess API key not configured')
  }

  const client = buildClient()

  await ensureSyncSource(tenantId)

  const syncLog = await db.query(
    `INSERT INTO sync_logs (sync_source_id, tenant_id, entity_type, status, started_at)
     SELECT id, $1, 'standards', 'running', NOW()
     FROM sync_sources WHERE tenant_id = $1 AND source_type = 'myitprocess'
     RETURNING id`,
    [tenantId]
  )
  const syncLogId = syncLog.rows[0]?.id

  try {
    // Build client name matcher
    const clients = await db.query(
      `SELECT id, name FROM clients WHERE tenant_id = $1`,
      [tenantId]
    )
    const findClient = buildClientMatcher(clients.rows)

    // ─── Phase 1: Import findings as standards ────────────────────────────
    console.log('[mitp-sync] Fetching findings...')
    const findings = await fetchAllPages(client, '/findings')
    console.log(`[mitp-sync] Fetched ${findings.length} findings`)

    // Extract unique questions as standards
    const questionMap = new Map() // label → { label, text, category }
    for (const f of findings) {
      const q = f.question
      if (!q || !q.label) continue
      if (!questionMap.has(q.label)) {
        questionMap.set(q.label, {
          label: q.label,
          text: q.text || q.label,
          category: f.reviewCategory || f.category || 'General',
        })
      }
    }

    console.log(`[mitp-sync] Found ${questionMap.size} unique standards from findings`)

    // Ensure categories exist and build lookup
    const categoryMap = {}
    const uniqueCategories = [...new Set([...questionMap.values()].map(q => q.category))]

    for (const catName of uniqueCategories) {
      const catResult = await db.query(
        `INSERT INTO standard_categories (tenant_id, name)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenantId, catName]
      )
      categoryMap[catName] = catResult.rows[0].id
    }

    // Upsert standards
    let standardsCreated = 0, standardsUpdated = 0

    for (const [label, q] of questionMap) {
      const categoryId = categoryMap[q.category]
      const result = await db.query(
        `INSERT INTO standards (
          tenant_id, category_id, name, description,
          external_id, external_source, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'myitprocess', '{}')
        ON CONFLICT (tenant_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category_id = EXCLUDED.category_id,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          categoryId,
          label,
          q.text,
          label,
        ]
      )

      if (result.rows[0]?.is_insert) standardsCreated++
      else standardsUpdated++
    }

    console.log(`[mitp-sync] Standards: ${standardsCreated} created, ${standardsUpdated} updated`)

    // ─── Phase 2: Import recommendations ──────────────────────────────────
    console.log('[mitp-sync] Fetching recommendations...')
    const recommendations = await fetchAllPages(client, '/recommendations')
    console.log(`[mitp-sync] Fetched ${recommendations.length} recommendations`)

    let recsCreated = 0, recsUpdated = 0, recsSkipped = 0

    for (const rec of recommendations) {
      const clientName = rec.clientName || rec.organizationName || null
      const clientId = findClient(clientName)
      if (!clientId) { recsSkipped++; continue }

      const severity = mapSeverity(rec.vcioAnswerType)
      const priorityMap = {
        'aligned': 'low',
        'marginal': 'medium',
        'vulnerable': 'high',
        'highly_vulnerable': 'critical',
        'not_assessed': 'medium',
      }
      const priority = priorityMap[severity] || 'medium'

      const externalId = rec.id?.toString() || rec.recommendationId?.toString()
      if (!externalId) { recsSkipped++; continue }

      const result = await db.query(
        `INSERT INTO recommendations (
          tenant_id, client_id, title, description,
          priority, type, status,
          estimated_budget,
          external_id, external_source, metadata, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, 'remediation', 'draft', $6, $7, 'myitprocess', $8, NOW())
        ON CONFLICT (tenant_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          priority = EXCLUDED.priority,
          estimated_budget = EXCLUDED.estimated_budget,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          tenantId,
          clientId,
          rec.title || rec.name || `Recommendation ${externalId}`,
          rec.description || rec.details || null,
          priority,
          rec.estimatedBudget || rec.budget || null,
          externalId,
          JSON.stringify(rec),
        ]
      )

      if (result.rows[0]?.is_insert) recsCreated++
      else recsUpdated++
    }

    console.log(`[mitp-sync] Recommendations: ${recsCreated} created, ${recsUpdated} updated, ${recsSkipped} skipped`)

    const total = questionMap.size + recommendations.length
    const created = standardsCreated + recsCreated
    const updated = standardsUpdated + recsUpdated
    const skipped = recsSkipped

    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'completed', completed_at = NOW(),
         records_fetched = $2, records_created = $3, records_updated = $4, records_skipped = $5
         WHERE id = $1`,
        [syncLogId, total, created, updated, skipped]
      )
    }

    console.log(`[mitp-sync] Done: ${created} created, ${updated} updated, ${skipped} skipped`)
    return { total, created, updated, skipped }
  } catch (err) {
    console.error('[mitp-sync] Error:', err.message)
    if (syncLogId) {
      await db.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [syncLogId, err.message]
      )
    }
    throw err
  }
}

module.exports = { syncMITP }
