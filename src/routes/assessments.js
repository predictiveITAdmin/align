const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/assessments — list assessments, optionally filtered by client
router.get('/', async (req, res) => {
  const { client_id, status } = req.query
  try {
    let query = `
      SELECT a.*,
             c.name as client_name,
             u.display_name as conducted_by_name,
             (SELECT count(*) FROM assessment_items ai WHERE ai.assessment_id = a.id) as item_count,
             (SELECT count(*) FROM assessment_items ai WHERE ai.assessment_id = a.id AND ai.severity IN ('vulnerable', 'highly_vulnerable')) as critical_count
      FROM assessments a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.conducted_by
      WHERE a.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) {
      params.push(client_id)
      query += ` AND a.client_id = $${params.length}`
    }
    if (status) {
      params.push(status)
      query += ` AND a.status = $${params.length}`
    }

    query += ` ORDER BY a.created_at DESC`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[assessments] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch assessments' })
  }
})

// GET /api/assessments/:id — single assessment with items
router.get('/:id', async (req, res) => {
  try {
    const assessment = await db.query(
      `SELECT a.*, c.name as client_name, u.display_name as conducted_by_name
       FROM assessments a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN users u ON u.id = a.conducted_by
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!assessment.rows.length) return res.status(404).json({ error: 'Assessment not found' })

    const items = await db.query(
      `SELECT ai.*, s.name as standard_name, sc.name as category_name
       FROM assessment_items ai
       JOIN standards s ON s.id = ai.standard_id
       JOIN standard_categories sc ON sc.id = s.category_id
       ORDER BY sc.sort_order, s.sort_order, s.name`,
      []
    )

    // Filter items to this assessment
    const assessmentItems = items.rows.filter(i => i.assessment_id === req.params.id)

    res.json({
      data: {
        ...assessment.rows[0],
        items: assessmentItems,
      },
    })
  } catch (err) {
    console.error('[assessments] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch assessment' })
  }
})

// POST /api/assessments — create a new assessment for a client
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { client_id, title, name, notes } = req.body
  try {
    // Create the assessment
    const assessment = await db.query(
      `INSERT INTO assessments (tenant_id, client_id, name, conducted_by, status, summary)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       RETURNING *`,
      [req.tenant.id, client_id, name || title || 'New Assessment', req.user.sub, notes || null]
    )

    const assessmentId = assessment.rows[0].id

    // Auto-populate assessment items from all active standards
    await db.query(
      `INSERT INTO assessment_items (assessment_id, standard_id, severity, notes)
       SELECT $1, s.id, 'marginal', NULL
       FROM standards s
       WHERE s.tenant_id = $2 AND s.is_active = true`,
      [assessmentId, req.tenant.id]
    )

    res.status(201).json({ data: assessment.rows[0] })
  } catch (err) {
    console.error('[assessments] create error:', err.message)
    res.status(500).json({ error: 'Failed to create assessment' })
  }
})

// PUT /api/assessments/:id/items/:itemId — update an assessment item (score it)
router.put('/:id/items/:itemId', requireAuth, async (req, res) => {
  const { severity, notes, recommendation_text } = req.body
  try {
    const result = await db.query(
      `UPDATE assessment_items SET
        severity = COALESCE($3, severity),
        notes = COALESCE($4, notes),
        updated_at = NOW()
       WHERE id = $1 AND assessment_id = $2
       RETURNING *`,
      [req.params.itemId, req.params.id, severity, notes]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update assessment item' })
  }
})

// POST /api/assessments/:id/complete — mark assessment as complete and calculate score
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    // Calculate overall score from items
    const items = await db.query(
      `SELECT severity FROM assessment_items WHERE assessment_id = $1`,
      [req.params.id]
    )

    const scoreMap = { aligned: 100, marginal: 60, vulnerable: 30, highly_vulnerable: 0 }
    const scores = items.rows.map(i => scoreMap[i.severity] ?? 50)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

    const result = await db.query(
      `UPDATE assessments SET
        status = 'completed',
        overall_score = $2,
        assessment_date = COALESCE(assessment_date, NOW()::date),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3
       RETURNING *`,
      [req.params.id, avgScore, req.tenant.id]
    )

    // Update client health score
    if (result.rows.length && avgScore != null) {
      await db.query(
        `UPDATE clients SET health_score = $2, updated_at = NOW() WHERE id = $1`,
        [result.rows[0].client_id, avgScore]
      )
    }

    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[assessments] complete error:', err.message)
    res.status(500).json({ error: 'Failed to complete assessment' })
  }
})

module.exports = router
