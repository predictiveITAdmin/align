const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/initiatives
router.get('/', requireAuth, async (req, res) => {
  const { client_id, status } = req.query
  try {
    let query = `
      SELECT i.*, c.name AS client_name, u.display_name AS owner_name,
             (SELECT COUNT(*) FROM initiative_recommendations ir WHERE ir.initiative_id = i.id) AS rec_count,
             (SELECT COALESCE(SUM(r.estimated_budget), 0) FROM initiative_recommendations ir
              JOIN recommendations r ON r.id = ir.recommendation_id WHERE ir.initiative_id = i.id) AS total_budget_calc
      FROM initiatives i
      JOIN clients c ON c.id = i.client_id
      LEFT JOIN users u ON u.id = i.owner_id
      WHERE i.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND i.client_id = $${params.length}` }
    if (status) { params.push(status); query += ` AND i.status = $${params.length}` }
    query += ` ORDER BY i.created_at DESC`
    const result = await db.query(query, params)
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[initiatives] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch initiatives' })
  }
})

// GET /api/initiatives/:id with recommendations
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const init = await db.query(
      `SELECT i.*, c.name AS client_name, u.display_name AS owner_name
       FROM initiatives i JOIN clients c ON c.id = i.client_id LEFT JOIN users u ON u.id = i.owner_id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!init.rows.length) return res.status(404).json({ error: 'Not found' })

    const recs = await db.query(
      `SELECT r.*, ir.sort_order,
              (SELECT COUNT(*) FROM recommendation_assets ra WHERE ra.recommendation_id = r.id) AS asset_count
       FROM initiative_recommendations ir
       JOIN recommendations r ON r.id = ir.recommendation_id
       WHERE ir.initiative_id = $1
       ORDER BY ir.sort_order, r.created_at`,
      [req.params.id]
    )
    res.json({ data: { ...init.rows[0], recommendations: recs.rows } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch initiative' })
  }
})

// POST /api/initiatives
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  const { client_id, name, description, status, start_date, target_end_date, total_budget } = req.body
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name required' })
  try {
    const result = await db.query(
      `INSERT INTO initiatives (tenant_id, client_id, name, description, status, owner_id, start_date, target_end_date, total_budget)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenant.id, client_id, name, description || null, status || 'planning',
       req.user.sub, start_date || null, target_end_date || null, total_budget || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create initiative' })
  }
})

// PATCH /api/initiatives/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { name, description, status, start_date, target_end_date, total_budget } = req.body
  try {
    const result = await db.query(
      `UPDATE initiatives SET
         name = COALESCE($3, name), description = COALESCE($4, description),
         status = COALESCE($5, status), start_date = COALESCE($6, start_date),
         target_end_date = COALESCE($7, target_end_date),
         total_budget = COALESCE($8, total_budget), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, description, status, start_date, target_end_date, total_budget]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update initiative' })
  }
})

// DELETE /api/initiatives/:id
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM initiatives WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete initiative' })
  }
})

// POST /api/initiatives/:id/recommendations — link a recommendation
router.post('/:id/recommendations', requireAuth, async (req, res) => {
  const { recommendation_id } = req.body
  try {
    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM initiative_recommendations WHERE initiative_id = $1`,
      [req.params.id]
    )
    await db.query(
      `INSERT INTO initiative_recommendations (initiative_id, recommendation_id, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, recommendation_id, maxOrder.rows[0].next]
    )
    res.status(201).json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link recommendation' })
  }
})

// DELETE /api/initiatives/:id/recommendations/:recId
router.delete('/:id/recommendations/:recId', requireAuth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM initiative_recommendations WHERE initiative_id = $1 AND recommendation_id = $2`,
      [req.params.id, req.params.recId]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink recommendation' })
  }
})

module.exports = router
