const express = require('express')
const router = express.Router({ mergeParams: true }) // mergeParams for :clientId from parent
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// ─── GET /api/clients/:clientId/standards — all standards with mapping status ─
router.get('/', async (req, res) => {
  const { clientId } = req.params
  try {
    // Return ALL approved standards with LEFT JOIN to client_standards
    // so unmapped standards appear with is_applicable = null
    const result = await db.query(`
      SELECT s.id AS standard_id, s.name, s.description, s.priority, s.level_tier, s.delivery_method,
             s.is_universal, s.status AS standard_status, s.business_impact,
             s.category_id, s.review_frequency, s.question_text, s.technical_rationale,
             sc.name AS category_name, sc.sort_order AS cat_sort,
             ss.name AS domain_name, ss.id AS domain_id, ss.sort_order AS domain_sort,
             cs.id AS mapping_id, cs.is_applicable, cs.applicability_source, cs.override_reason,
             cs.created_at AS mapped_at, cs.updated_at AS mapping_updated_at,
             cs.last_reviewed_at,
             last_resp.level AS last_response_level,
             last_resp.label AS last_response_label,
             last_resp.is_aligned AS last_response_aligned
      FROM standards s
      JOIN standard_categories sc ON sc.id = s.category_id
      LEFT JOIN standard_sections ss ON ss.id = sc.section_id
      LEFT JOIN client_standards cs ON cs.standard_id = s.id AND cs.client_id = $1
      LEFT JOIN LATERAL (
        SELECT sr.level, sr.label, sr.is_aligned
        FROM assessment_items ai
        JOIN assessments a ON a.id = ai.assessment_id
        LEFT JOIN standard_responses sr ON sr.id = ai.response_id
        WHERE ai.standard_id = s.id AND a.client_id = $1 AND ai.response_id IS NOT NULL
        ORDER BY ai.answered_at DESC NULLS LAST
        LIMIT 1
      ) last_resp ON true
      WHERE s.tenant_id = $2 AND s.status = 'approved' AND s.is_active = true
      ORDER BY ss.sort_order NULLS LAST, sc.sort_order, s.name
    `, [clientId, req.tenant.id])
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[clientStandards] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch client standards' })
  }
})

// ─── GET /api/clients/:clientId/standards/summary — domain-level counts ───────
router.get('/summary', async (req, res) => {
  const { clientId } = req.params
  try {
    const result = await db.query(`
      SELECT ss.id AS domain_id, ss.name AS domain_name, ss.sort_order,
             COUNT(*) AS total_count,
             COUNT(*) FILTER (WHERE cs.is_applicable = true) AS applicable_count,
             COUNT(*) FILTER (WHERE cs.is_applicable = false) AS excluded_count,
             COUNT(*) FILTER (WHERE cs.id IS NULL) AS unmapped_count,
             COUNT(*) FILTER (WHERE s.priority = 'high') AS high_count,
             COUNT(*) FILTER (WHERE cs.is_applicable = true AND s.delivery_method = 'automated') AS automated_count
      FROM standards s
      JOIN standard_categories sc ON sc.id = s.category_id
      LEFT JOIN standard_sections ss ON ss.id = sc.section_id
      LEFT JOIN client_standards cs ON cs.standard_id = s.id AND cs.client_id = $1
      WHERE s.tenant_id = $2 AND s.status = 'approved' AND s.is_active = true
      GROUP BY ss.id, ss.name, ss.sort_order
      ORDER BY ss.sort_order
    `, [clientId, req.tenant.id])
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[clientStandards] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch summary' })
  }
})

// ─── POST /api/clients/:clientId/standards/auto-map — run the auto-mapping engine
router.post('/auto-map', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { clientId } = req.params
  try {
    // 1. Get client profile
    const clientRes = await db.query(
      `SELECT vertical, frameworks_enabled, identity_platform, infra_model, lob_apps, platform_stack
       FROM clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, req.tenant.id]
    )
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' })
    const client = clientRes.rows[0]

    // 2. Get all approved standards
    const standardsRes = await db.query(
      `SELECT s.id, s.is_universal
       FROM standards s
       WHERE s.tenant_id = $1 AND s.status = 'approved' AND s.is_active = true`,
      [req.tenant.id]
    )

    // 3. Get tag-based standards
    const verticalStds = client.vertical ? (await db.query(
      `SELECT standard_id FROM standard_vertical_tags WHERE vertical = $1`, [client.vertical]
    )).rows.map(r => r.standard_id) : []

    const frameworkStds = client.frameworks_enabled?.length ? (await db.query(
      `SELECT DISTINCT standard_id FROM standard_framework_tags WHERE framework = ANY($1)`,
      [client.frameworks_enabled]
    )).rows.map(r => r.standard_id) : []

    const techStds = client.lob_apps?.length ? (await db.query(
      `SELECT DISTINCT standard_id FROM standard_tech_tags WHERE tech_tag = ANY($1)`,
      [client.lob_apps]
    )).rows.map(r => r.standard_id) : []

    // 4. Build the mapping: universal + vertical + framework + tech
    const mappings = new Map()

    for (const std of standardsRes.rows) {
      if (std.is_universal) {
        mappings.set(std.id, { standard_id: std.id, is_applicable: true, source: 'universal' })
      }
    }

    for (const stdId of verticalStds) {
      if (!mappings.has(stdId)) {
        mappings.set(stdId, { standard_id: stdId, is_applicable: true, source: 'vertical' })
      }
    }

    for (const stdId of frameworkStds) {
      if (!mappings.has(stdId)) {
        mappings.set(stdId, { standard_id: stdId, is_applicable: true, source: 'framework' })
      }
    }

    for (const stdId of techStds) {
      if (!mappings.has(stdId)) {
        mappings.set(stdId, { standard_id: stdId, is_applicable: true, source: 'tech' })
      }
    }

    // 5. Upsert into client_standards (preserve manual overrides)
    let inserted = 0, updated = 0
    for (const [, m] of mappings) {
      const result = await db.query(`
        INSERT INTO client_standards (tenant_id, client_id, standard_id, is_applicable, applicability_source)
        VALUES ($1, $2, $3, $4, $5::applicability_source)
        ON CONFLICT (client_id, standard_id) DO UPDATE SET
          is_applicable = CASE
            WHEN client_standards.applicability_source = 'manual' THEN client_standards.is_applicable
            ELSE EXCLUDED.is_applicable
          END,
          applicability_source = CASE
            WHEN client_standards.applicability_source = 'manual' THEN client_standards.applicability_source
            ELSE EXCLUDED.applicability_source
          END,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_new
      `, [req.tenant.id, clientId, m.standard_id, m.is_applicable, m.source])

      if (result.rows[0]?.is_new) inserted++
      else updated++
    }

    // 6. Update client standards_count
    const countRes = await db.query(
      `SELECT count(*) FROM client_standards WHERE client_id = $1 AND is_applicable = true`,
      [clientId]
    )
    await db.query(
      `UPDATE clients SET standards_count = $2, updated_at = NOW() WHERE id = $1`,
      [clientId, parseInt(countRes.rows[0].count)]
    )

    res.json({
      status: 'ok',
      inserted,
      updated,
      total_mapped: mappings.size,
      standards_count: parseInt(countRes.rows[0].count),
    })
  } catch (err) {
    console.error('[clientStandards] auto-map error:', err.message)
    res.status(500).json({ error: 'Failed to auto-map standards' })
  }
})

// ─── PATCH /api/clients/:clientId/standards/:standardId — toggle or override ──
router.patch('/:standardId', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { clientId, standardId } = req.params
  const { is_applicable, override_reason } = req.body
  try {
    const result = await db.query(`
      INSERT INTO client_standards (tenant_id, client_id, standard_id, is_applicable, applicability_source, override_reason)
      VALUES ($1, $2, $3, $4, 'manual', $5)
      ON CONFLICT (client_id, standard_id) DO UPDATE SET
        is_applicable = $4,
        applicability_source = 'manual',
        override_reason = COALESCE($5, client_standards.override_reason),
        updated_at = NOW()
      RETURNING *
    `, [req.tenant.id, clientId, standardId,
        typeof is_applicable === 'boolean' ? is_applicable : true,
        override_reason || null])

    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[clientStandards] override error:', err.message)
    res.status(500).json({ error: 'Failed to update client standard' })
  }
})

module.exports = router
