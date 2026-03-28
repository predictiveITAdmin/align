const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/contacts — list contacts, filterable by client
router.get('/', async (req, res) => {
  const { client_id, search } = req.query
  try {
    let query = `
      SELECT cc.*,
             c.name as client_name,
             c.autotask_company_id
      FROM client_contacts cc
      JOIN clients c ON c.id = cc.client_id
      WHERE cc.tenant_id = $1 AND cc.is_active = true`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND cc.client_id = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      query += ` AND (cc.first_name ILIKE $${params.length} OR cc.last_name ILIKE $${params.length} OR cc.email ILIKE $${params.length})`
    }

    query += ` ORDER BY cc.is_primary DESC, cc.last_name, cc.first_name LIMIT 500`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[contacts] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch contacts' })
  }
})

module.exports = router
