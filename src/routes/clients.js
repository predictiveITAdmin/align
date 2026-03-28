const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/clients — list clients for tenant
// Default: only managed + active clients. Use ?show_all=true for all.
router.get('/', async (req, res) => {
  const { show_all, search } = req.query
  try {
    let query = `
      SELECT id, name, autotask_company_id, website, phone,
             city, state, is_active, classification, health_score,
             assigned_vcio_id, assigned_tam_id,
             last_synced_at, created_at, updated_at,
             (SELECT count(*) FROM assets a WHERE a.client_id = clients.id) as asset_count,
             (SELECT count(*) FROM recommendations r WHERE r.client_id = clients.id) as rec_count,
             (SELECT ROUND(
               (count(*) FILTER (WHERE rating IN ('gold','green'))::numeric /
                NULLIF(count(*), 0) * 100), 0
             ) FROM csat_responses cr WHERE cr.client_id = clients.id) as csat_score
      FROM clients
      WHERE tenant_id = $1 AND is_active = true`
    const params = [req.tenant.id]

    if (!show_all || show_all !== 'true') {
      query += ` AND classification = 'managed'`
    }

    if (search) {
      params.push(`%${search}%`)
      query += ` AND name ILIKE $${params.length}`
    }

    query += ` ORDER BY name`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[clients] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

// GET /api/clients/:id — single client with stats
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*,
        (SELECT count(*) FROM assets a WHERE a.client_id = c.id) as asset_count,
        (SELECT count(*) FROM assets a WHERE a.client_id = c.id AND a.warranty_expiry < NOW()) as expired_warranty_count,
        (SELECT count(*) FROM recommendations r WHERE r.client_id = c.id AND r.status NOT IN ('completed','declined')) as open_rec_count,
        (SELECT count(*) FROM assessments a2 WHERE a2.client_id = c.id) as assessment_count,
        (SELECT count(*) FROM eos_rocks r WHERE r.client_id = c.id AND r.status != 'completed') as active_rocks,
        (SELECT ROUND(
          (count(*) FILTER (WHERE rating IN ('gold','green'))::numeric /
           NULLIF(count(*), 0) * 100), 0
        ) FROM csat_responses cr WHERE cr.client_id = c.id) as csat_score,
        (SELECT count(*) FROM csat_responses cr WHERE cr.client_id = c.id) as csat_total,
        (SELECT count(*) FROM saas_licenses sl WHERE sl.client_id = c.id) as license_count
      FROM clients c
      WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[clients] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch client' })
  }
})

// PATCH /api/clients/:id — update classification or other fields
router.patch('/:id', async (req, res) => {
  const { classification, assigned_vcio_id, assigned_tam_id } = req.body
  try {
    const result = await db.query(
      `UPDATE clients SET
        classification = COALESCE($3, classification),
        assigned_vcio_id = COALESCE($4, assigned_vcio_id),
        assigned_tam_id = COALESCE($5, assigned_tam_id),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, classification, assigned_vcio_id, assigned_tam_id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client' })
  }
})

module.exports = router
