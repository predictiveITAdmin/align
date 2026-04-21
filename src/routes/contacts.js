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

// GET /api/contacts/:id — single contact
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cc.*, c.name AS client_name, c.autotask_company_id
       FROM client_contacts cc
       JOIN clients c ON c.id = cc.client_id
       WHERE cc.id = $1 AND cc.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Contact not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[contacts] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch contact' })
  }
})

// PATCH /api/contacts/:id — update contact fields
router.patch('/:id', async (req, res) => {
  const { first_name, last_name, title, email, phone, mobile_phone, is_primary, sync_enabled } = req.body
  try {
    const result = await db.query(
      `UPDATE client_contacts SET
        first_name   = COALESCE($3, first_name),
        last_name    = COALESCE($4, last_name),
        title        = COALESCE($5, title),
        email        = COALESCE($6, email),
        phone        = COALESCE($7, phone),
        mobile_phone = COALESCE($8, mobile_phone),
        is_primary   = COALESCE($9, is_primary),
        sync_enabled = COALESCE($10, sync_enabled),
        updated_at   = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.tenant.id,
        first_name,
        last_name,
        title,
        email,
        phone,
        mobile_phone,
        is_primary,
        sync_enabled,
      ]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Contact not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[contacts] update error:', err.message)
    res.status(500).json({ error: 'Failed to update contact' })
  }
})

module.exports = router
