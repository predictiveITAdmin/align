const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/recommendations — list all, filterable by client, status, priority
router.get('/', async (req, res) => {
  const { client_id, status, priority, initiative_id } = req.query
  try {
    let query = `
      SELECT r.*,
             c.name as client_name,
             u.display_name as assigned_to_name
      FROM recommendations r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND r.client_id = $${params.length}` }
    if (status) { params.push(status); query += ` AND r.status = $${params.length}` }
    if (priority) { params.push(priority); query += ` AND r.priority = $${params.length}` }
    if (initiative_id) {
      params.push(initiative_id)
      query += ` AND r.id IN (SELECT recommendation_id FROM initiative_recommendations WHERE initiative_id = $${params.length})`
    }

    query += ` ORDER BY r.priority DESC, r.created_at DESC`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[recommendations] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch recommendations' })
  }
})

// GET /api/recommendations/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, c.name as client_name,
              u.display_name as assigned_to_name
       FROM recommendations r
       JOIN clients c ON c.id = r.client_id
       LEFT JOIN users u ON u.id = r.assigned_to
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Recommendation not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recommendation' })
  }
})

// POST /api/recommendations
router.post('/', requireAuth, async (req, res) => {
  const {
    client_id, assessment_item_id,
    title, description, type, priority, status,
    estimated_budget, estimated_hours,
    responsible_party, assigned_to
  } = req.body

  try {
    const result = await db.query(
      `INSERT INTO recommendations (
        tenant_id, client_id, assessment_item_id,
        title, description, type, priority, status,
        estimated_budget, estimated_hours,
        responsible_party, assigned_to
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        req.tenant.id, client_id, assessment_item_id || null,
        title, description || null,
        type || 'project', priority || 'medium', status || 'draft',
        estimated_budget || 0, estimated_hours || 0,
        responsible_party || 'msp', assigned_to || null
      ]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[recommendations] create error:', err.message)
    res.status(500).json({ error: 'Failed to create recommendation' })
  }
})

// PATCH /api/recommendations/:id — update status, priority, etc.
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, description, type, priority, status, estimated_budget, estimated_hours, responsible_party, assigned_to } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendations SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        type = COALESCE($5, type),
        priority = COALESCE($6, priority),
        status = COALESCE($7, status),
        estimated_budget = COALESCE($8, estimated_budget),
        estimated_hours = COALESCE($9, estimated_hours),
        responsible_party = COALESCE($10, responsible_party),
        assigned_to = COALESCE($11, assigned_to),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, title, description, type, priority, status, estimated_budget, estimated_hours, responsible_party, assigned_to]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Recommendation not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update recommendation' })
  }
})

module.exports = router
