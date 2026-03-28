const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/clients — list all clients for tenant
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, autotask_company_id, is_active,
              alignment_score, last_assessment_at, last_qbr_at,
              created_at, updated_at
       FROM clients
       WHERE is_active = true
       ORDER BY name`
    )
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[clients] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

// GET /api/clients/:id — single client detail
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM clients WHERE id = $1`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[clients] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch client' })
  }
})

module.exports = router
