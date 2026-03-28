const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/standards/categories — list all standard categories
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sc.*,
              (SELECT count(*) FROM standards s WHERE s.category_id = sc.id) as standard_count
       FROM standard_categories sc
       WHERE sc.tenant_id = $1
       ORDER BY sc.sort_order, sc.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[standards] categories error:', err.message)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// POST /api/standards/categories — create a category
router.post('/categories', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, icon, sort_order } = req.body
  try {
    const result = await db.query(
      `INSERT INTO standard_categories (tenant_id, name, description, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.tenant.id, name, description || null, icon || null, sort_order || 0]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[standards] create category error:', err.message)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// GET /api/standards — list all standards, optionally filtered by category
router.get('/', async (req, res) => {
  const { category_id } = req.query
  try {
    let query = `
      SELECT s.*, sc.name as category_name
      FROM standards s
      JOIN standard_categories sc ON sc.id = s.category_id
      WHERE s.tenant_id = $1`
    const params = [req.tenant.id]

    if (category_id) {
      query += ` AND s.category_id = $2`
      params.push(category_id)
    }

    query += ` ORDER BY sc.sort_order, sc.name, s.sort_order, s.name`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[standards] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch standards' })
  }
})

// GET /api/standards/:id — single standard
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, sc.name as category_name
       FROM standards s
       JOIN standard_categories sc ON sc.id = s.category_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Standard not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch standard' })
  }
})

// POST /api/standards — create a standard
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { category_id, name, description, criteria, severity_weight, sort_order } = req.body
  try {
    const result = await db.query(
      `INSERT INTO standards (tenant_id, category_id, name, description, criteria, severity_weight, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.tenant.id, category_id, name, description || null, criteria || null, severity_weight || 1.0, sort_order || 0]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[standards] create error:', err.message)
    res.status(500).json({ error: 'Failed to create standard' })
  }
})

// PUT /api/standards/:id — update a standard
router.put('/:id', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, criteria, severity_weight, sort_order, is_active } = req.body
  try {
    const result = await db.query(
      `UPDATE standards SET
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        criteria = COALESCE($5, criteria),
        severity_weight = COALESCE($6, severity_weight),
        sort_order = COALESCE($7, sort_order),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, name, description, criteria, severity_weight, sort_order, is_active]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Standard not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update standard' })
  }
})

module.exports = router
