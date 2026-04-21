const express = require('express')
const router  = express.Router()
const db      = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/goals?client_id=&status=&year=
router.get('/', requireAuth, async (req, res) => {
  const { client_id, status, year } = req.query
  try {
    let query = `
      SELECT g.*,
        (SELECT COUNT(*) FROM goal_initiatives gi WHERE gi.goal_id = g.id) AS initiative_count
      FROM goals g
      WHERE g.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND g.client_id = $${params.length}` }
    if (status)    { params.push(status);    query += ` AND g.status = $${params.length}` }
    if (year)      { params.push(parseInt(year)); query += ` AND g.target_year = $${params.length}` }
    query += ` ORDER BY g.created_at DESC`
    const result = await db.query(query, params)
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[goals] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch goals' })
  }
})

// POST /api/goals
router.post('/', requireAuth, async (req, res) => {
  const { client_id, title, description, status, target_year, target_period } = req.body
  if (!client_id || !title) return res.status(400).json({ error: 'client_id and title are required' })
  try {
    const result = await db.query(
      `INSERT INTO goals (tenant_id, client_id, title, description, status, target_year, target_period)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenant.id, client_id, title, description || null, status || 'on_track',
       target_year || null, target_period || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[goals] create error:', err.message)
    res.status(500).json({ error: 'Failed to create goal' })
  }
})

// GET /api/goals/action-items?client_id= — all goal action items for a client
router.get('/action-items', requireAuth, async (req, res) => {
  const { client_id } = req.query
  try {
    let query = `
      SELECT gai.id, gai.goal_id, gai.text, gai.completed, gai.due_date, gai.created_at,
             g.title AS goal_title, g.client_id
      FROM goal_action_items gai
      JOIN goals g ON g.id = gai.goal_id
      WHERE g.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND g.client_id = $${params.length}` }
    query += ' ORDER BY gai.created_at DESC'
    const result = await db.query(query, params)
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[goals] action-items error:', err.message)
    res.status(500).json({ error: 'Failed to fetch goal action items' })
  }
})

// GET /api/goals/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [goal, initiatives, actionItems] = await Promise.all([
      db.query(
        `SELECT g.* FROM goals g WHERE g.id = $1 AND g.tenant_id = $2`,
        [req.params.id, req.tenant.id]
      ),
      db.query(
        `SELECT r.id, r.title, r.status, r.priority, r.schedule_year, r.schedule_quarter, r.kind
         FROM goal_initiatives gi
         JOIN recommendations r ON r.id = gi.recommendation_id
         WHERE gi.goal_id = $1
         ORDER BY r.created_at DESC`,
        [req.params.id]
      ),
      db.query(
        `SELECT * FROM goal_action_items WHERE goal_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      ),
    ])
    if (!goal.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: { ...goal.rows[0], initiatives: initiatives.rows, action_items: actionItems.rows } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch goal' })
  }
})

// PATCH /api/goals/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, description, status, target_year, target_quarter, target_period } = req.body
  try {
    const result = await db.query(
      `UPDATE goals SET
         title          = COALESCE($3, title),
         description    = COALESCE($4, description),
         status         = COALESCE($5, status),
         target_year    = COALESCE($6, target_year),
         target_quarter = COALESCE($7, target_quarter),
         target_period  = COALESCE($8, target_period),
         updated_at     = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, title, description, status,
       target_year !== undefined ? target_year : null,
       target_quarter !== undefined ? target_quarter : null,
       target_period]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update goal' })
  }
})

// DELETE /api/goals/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM goals WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete goal' })
  }
})

// POST /api/goals/:id/initiatives — link a recommendation/initiative
router.post('/:id/initiatives', requireAuth, async (req, res) => {
  const { recommendation_id } = req.body
  if (!recommendation_id) return res.status(400).json({ error: 'recommendation_id required' })
  try {
    await db.query(
      `INSERT INTO goal_initiatives (goal_id, recommendation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, recommendation_id]
    )
    res.status(201).json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link initiative' })
  }
})

// DELETE /api/goals/:id/initiatives/:recId
router.delete('/:id/initiatives/:recId', requireAuth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM goal_initiatives WHERE goal_id = $1 AND recommendation_id = $2`,
      [req.params.id, req.params.recId]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink initiative' })
  }
})

// ── Goal Action Items ─────────────────────────────────────────────────────────

// POST /api/goals/:id/action-items
router.post('/:id/action-items', requireAuth, async (req, res) => {
  const { text, due_date } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  try {
    const check = await db.query('SELECT id FROM goals WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant.id])
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' })
    const result = await db.query(
      `INSERT INTO goal_action_items (goal_id, text, due_date) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, text.trim(), due_date || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create action item' })
  }
})

// PATCH /api/goals/:id/action-items/:itemId
router.patch('/:id/action-items/:itemId', requireAuth, async (req, res) => {
  const { text, completed, due_date } = req.body
  try {
    const result = await db.query(
      `UPDATE goal_action_items SET
         text       = COALESCE($3, text),
         completed  = COALESCE($4, completed),
         due_date   = COALESCE($5, due_date),
         updated_at = NOW()
       WHERE id = $1 AND goal_id = $2 RETURNING *`,
      [req.params.itemId, req.params.id,
       text ?? null,
       completed !== undefined ? completed : null,
       due_date !== undefined ? due_date : null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update action item' })
  }
})

// DELETE /api/goals/:id/action-items/:itemId
router.delete('/:id/action-items/:itemId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM goal_action_items WHERE id=$1 AND goal_id=$2', [req.params.itemId, req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete action item' })
  }
})

module.exports = router
