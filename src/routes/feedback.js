const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/feedback — list feature requests
// Tenants see their own. Global admin sees all.
router.get('/', requireAuth, async (req, res) => {
  try {
    const isGlobalAdmin = req.user.role === 'global_admin'
    let query = `
      SELECT fr.*, u.display_name as submitted_by_name, t.name as tenant_name
      FROM feature_requests fr
      LEFT JOIN users u ON u.id = fr.submitted_by
      LEFT JOIN tenants t ON t.id = fr.tenant_id
      WHERE 1=1`
    const params = []

    if (!isGlobalAdmin) {
      params.push(req.tenant.id)
      query += ` AND fr.tenant_id = $${params.length}`
    }

    const { status, category } = req.query
    if (status) { params.push(status); query += ` AND fr.status = $${params.length}` }
    if (category) { params.push(category); query += ` AND fr.category = $${params.length}` }

    query += ` ORDER BY fr.votes DESC, fr.created_at DESC`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[feedback] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch feature requests' })
  }
})

// POST /api/feedback — submit a feature request or feedback
router.post('/', requireAuth, async (req, res) => {
  const { title, description, category } = req.body
  if (!title) return res.status(400).json({ error: 'Title is required' })

  try {
    const result = await db.query(
      `INSERT INTO feature_requests (tenant_id, submitted_by, title, description, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.tenant.id, req.user.sub, title, description || null, category || 'general']
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[feedback] create error:', err.message)
    res.status(500).json({ error: 'Failed to submit feedback' })
  }
})

// POST /api/feedback/:id/vote — upvote a feature request
router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE feature_requests SET votes = votes + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to vote' })
  }
})

// PATCH /api/feedback/:id — admin update (status, priority, notes)
router.patch('/:id', requireAuth, requireRole('global_admin'), async (req, res) => {
  const { status, priority, admin_notes } = req.body
  try {
    const result = await db.query(
      `UPDATE feature_requests SET
        status = COALESCE($2, status),
        priority = COALESCE($3, priority),
        admin_notes = COALESCE($4, admin_notes),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, priority, admin_notes]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' })
  }
})

// DELETE /api/feedback/:id — admin delete
router.delete('/:id', requireAuth, requireRole('global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM feature_requests WHERE id = $1`, [req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' })
  }
})

module.exports = router
