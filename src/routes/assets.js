const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/assets — list assets, filterable by client, type, status
router.get('/', async (req, res) => {
  const { client_id, asset_type_id, warranty_status, search } = req.query
  try {
    let query = `
      SELECT a.*,
             c.name as client_name,
             at.name as asset_type_name
      FROM assets a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN asset_types at ON at.id = a.asset_type_id
      WHERE a.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND a.client_id = $${params.length}` }
    if (asset_type_id) { params.push(asset_type_id); query += ` AND a.asset_type_id = $${params.length}` }
    if (warranty_status === 'expired') {
      query += ` AND a.warranty_expiry < NOW()`
    } else if (warranty_status === 'expiring_soon') {
      query += ` AND a.warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days'`
    } else if (warranty_status === 'active') {
      query += ` AND a.warranty_expiry > NOW()`
    }
    if (search) {
      params.push(`%${search}%`)
      query += ` AND (a.name ILIKE $${params.length} OR a.serial_number ILIKE $${params.length})`
    }

    query += ` ORDER BY a.name LIMIT 500`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[assets] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch assets' })
  }
})

// GET /api/assets/summary — aggregate counts by type, warranty status
router.get('/summary', async (req, res) => {
  const { client_id } = req.query
  try {
    const clientFilter = client_id ? 'AND a.client_id = $2' : ''
    const params = client_id ? [req.tenant.id, client_id] : [req.tenant.id]

    const byType = await db.query(
      `SELECT at.name as type, count(*) as count
       FROM assets a
       LEFT JOIN asset_types at ON at.id = a.asset_type_id
       WHERE a.tenant_id = $1 ${clientFilter}
       GROUP BY at.name ORDER BY count DESC`,
      params
    )

    const warrantyStats = await db.query(
      `SELECT
         count(*) FILTER (WHERE warranty_expiry IS NULL) as unknown,
         count(*) FILTER (WHERE warranty_expiry > NOW() + INTERVAL '90 days') as active,
         count(*) FILTER (WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days') as expiring_soon,
         count(*) FILTER (WHERE warranty_expiry < NOW()) as expired,
         count(*) as total
       FROM assets a
       WHERE a.tenant_id = $1 ${clientFilter}`,
      params
    )

    res.json({
      by_type: byType.rows,
      warranty: warrantyStats.rows[0],
    })
  } catch (err) {
    console.error('[assets] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch asset summary' })
  }
})

// GET /api/assets/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, c.name as client_name, at.name as asset_type_name
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN asset_types at ON at.id = a.asset_type_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Asset not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset' })
  }
})

// GET /api/assets/types — list asset types
router.get('/types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM asset_types WHERE tenant_id = $1 ORDER BY name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset types' })
  }
})

module.exports = router
