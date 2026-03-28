const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

// ═══════════════════════════════════════════════════════════════════════════════
// ROCKS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/eos/rocks — list rocks, filterable by client, quarter, status
router.get('/rocks', async (req, res) => {
  const { client_id, quarter, year, status } = req.query
  try {
    let query = `
      SELECT r.*, c.name as client_name, u.display_name as owner_name
      FROM eos_rocks r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND r.client_id = $${params.length}` }
    if (quarter) { params.push(quarter); query += ` AND r.fiscal_quarter = $${params.length}` }
    if (year) { params.push(parseInt(year)); query += ` AND r.fiscal_year = $${params.length}` }
    if (status) { params.push(status); query += ` AND r.status = $${params.length}` }

    query += ` ORDER BY r.fiscal_year DESC, r.fiscal_quarter DESC`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[eos] rocks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch rocks' })
  }
})

// POST /api/eos/rocks
router.post('/rocks', requireAuth, async (req, res) => {
  const { client_id, title, description, owner_id, fiscal_quarter, fiscal_year, initiative_id } = req.body
  try {
    const result = await db.query(
      `INSERT INTO eos_rocks (tenant_id, client_id, title, description, owner_id, fiscal_quarter, fiscal_year, initiative_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'on_track')
       RETURNING *`,
      [req.tenant.id, client_id, title, description || null, owner_id || null,
       fiscal_quarter || Math.ceil((new Date().getMonth() + 1) / 3),
       fiscal_year || new Date().getFullYear(),
       initiative_id || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[eos] create rock error:', err.message)
    res.status(500).json({ error: 'Failed to create rock' })
  }
})

// PATCH /api/eos/rocks/:id
router.patch('/rocks/:id', requireAuth, async (req, res) => {
  const { title, description, status, owner_id, completion_pct } = req.body
  try {
    const result = await db.query(
      `UPDATE eos_rocks SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        owner_id = COALESCE($6, owner_id),
        completion_pct = COALESCE($7, completion_pct),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, title, description, status, owner_id, completion_pct]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Rock not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rock' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SCORECARD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/eos/scorecard — list measurables for a client
router.get('/scorecard', async (req, res) => {
  const { client_id } = req.query
  if (!client_id) return res.status(400).json({ error: 'client_id required' })

  try {
    const measurables = await db.query(
      `SELECT m.*, u.display_name as owner_name
       FROM eos_scorecard_measurables m
       LEFT JOIN users u ON u.id = m.owner_id
       WHERE m.tenant_id = $1 AND m.client_id = $2 AND m.is_active = true
       ORDER BY m.sort_order`,
      [req.tenant.id, client_id]
    )

    // Get last 13 weeks of entries for each measurable
    const entries = await db.query(
      `SELECT e.*
       FROM eos_scorecard_entries e
       JOIN eos_scorecard_measurables m ON m.id = e.measurable_id
       WHERE m.tenant_id = $1 AND m.client_id = $2
       AND e.period_date >= NOW() - INTERVAL '13 weeks'
       ORDER BY e.period_date DESC`,
      [req.tenant.id, client_id]
    )

    res.json({
      measurables: measurables.rows,
      entries: entries.rows,
    })
  } catch (err) {
    console.error('[eos] scorecard error:', err.message)
    res.status(500).json({ error: 'Failed to fetch scorecard' })
  }
})

// POST /api/eos/scorecard/measurables
router.post('/scorecard/measurables', requireAuth, async (req, res) => {
  const { client_id, title, description, goal_value, goal_direction, frequency, owner_id, unit, sort_order } = req.body
  try {
    const result = await db.query(
      `INSERT INTO eos_scorecard_measurables (tenant_id, client_id, title, description, goal_value, goal_direction, frequency, owner_id, unit, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.tenant.id, client_id, title, description || null, goal_value, goal_direction || 'gte', frequency || 'weekly', owner_id || null, unit || null, sort_order || 0]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create measurable' })
  }
})

// POST /api/eos/scorecard/entries — log a scorecard value
router.post('/scorecard/entries', requireAuth, async (req, res) => {
  const { measurable_id, period_date, actual_value } = req.body
  try {
    const result = await db.query(
      `INSERT INTO eos_scorecard_entries (measurable_id, period_date, actual_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (measurable_id, period_date) DO UPDATE SET actual_value = $3, updated_at = NOW()
       RETURNING *`,
      [measurable_id, period_date, actual_value]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to log scorecard entry' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// TO-DOS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/eos/todos
router.get('/todos', async (req, res) => {
  const { client_id, status, owner_id } = req.query
  try {
    let query = `
      SELECT t.*, c.name as client_name, u.display_name as owner_name
      FROM eos_todos t
      JOIN clients c ON c.id = t.client_id
      LEFT JOIN users u ON u.id = t.owner_id
      WHERE t.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND t.client_id = $${params.length}` }
    if (status === 'open') query += ` AND t.status = 'open'`
    if (status === 'done') query += ` AND t.status = 'done'`
    if (owner_id) { params.push(owner_id); query += ` AND t.owner_id = $${params.length}` }

    query += ` ORDER BY t.status, t.due_date`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch todos' })
  }
})

// POST /api/eos/todos
router.post('/todos', requireAuth, async (req, res) => {
  const { client_id, title, owner_id, due_date, rock_id } = req.body
  try {
    const result = await db.query(
      `INSERT INTO eos_todos (tenant_id, client_id, title, owner_id, due_date, rock_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.tenant.id, client_id, title, owner_id || null, due_date || null, rock_id || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create todo' })
  }
})

// PATCH /api/eos/todos/:id
router.patch('/todos/:id', requireAuth, async (req, res) => {
  const { title, status, owner_id, due_date } = req.body
  try {
    const result = await db.query(
      `UPDATE eos_todos SET
        title = COALESCE($3, title),
        status = COALESCE($4, status),
        owner_id = COALESCE($5, owner_id),
        due_date = COALESCE($6, due_date),
        completed_date = CASE WHEN $4 = 'done' THEN NOW() ELSE completed_date END,
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, title, status, owner_id, due_date]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Todo not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update todo' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/eos/issues
router.get('/issues', async (req, res) => {
  const { client_id, status } = req.query
  try {
    let query = `
      SELECT i.*, c.name as client_name, u.display_name as owner_name
      FROM eos_issues i
      JOIN clients c ON c.id = i.client_id
      LEFT JOIN users u ON u.id = i.assigned_to
      WHERE i.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND i.client_id = $${params.length}` }
    if (status === 'open') query += ` AND i.status = 'open'`
    if (status === 'resolved') query += ` AND i.status = 'resolved'`

    query += ` ORDER BY i.status, i.priority DESC, i.created_at DESC`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' })
  }
})

// POST /api/eos/issues
router.post('/issues', requireAuth, async (req, res) => {
  const { client_id, title, description, priority, assigned_to } = req.body
  try {
    const result = await db.query(
      `INSERT INTO eos_issues (tenant_id, client_id, title, description, priority, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.tenant.id, client_id, title, description || null, priority || 'medium', assigned_to || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create issue' })
  }
})

// PATCH /api/eos/issues/:id
router.patch('/issues/:id', requireAuth, async (req, res) => {
  const { title, description, priority, status, resolution, assigned_to } = req.body
  try {
    const result = await db.query(
      `UPDATE eos_issues SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        priority = COALESCE($5, priority),
        status = COALESCE($6, status),
        resolution = COALESCE($7, resolution),
        assigned_to = COALESCE($8, assigned_to),
        resolved_date = CASE WHEN $6 = 'resolved' THEN NOW() ELSE resolved_date END,
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, title, description, priority, status, resolution, assigned_to]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Issue not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update issue' })
  }
})

module.exports = router
