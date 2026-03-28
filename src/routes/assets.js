const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/assets — list assets, filterable by client, type, status
router.get('/', async (req, res) => {
  const { client_id, asset_type_id, warranty_status, search } = req.query
  try {
    let query = `
      SELECT a.id, a.client_id, a.asset_type_id, a.name, a.serial_number,
             a.manufacturer, a.model, a.operating_system, a.os_version,
             a.purchase_date, a.warranty_expiry, a.eol_date,
             a.ip_address, a.mac_address, a.is_online, a.is_active, a.is_managed,
             a.antivirus_status, a.patch_status, a.notes,
             a.primary_source, a.last_seen_at,
             a.autotask_ci_id, a.datto_rmm_device_id, a.it_glue_config_id, a.auvik_device_id,
             a.datto_rmm_data, a.it_glue_data, a.autotask_data, a.auvik_data,
             a.created_at, a.updated_at,
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

    const limit = Math.min(parseInt(req.query.limit || '500', 10), 5000)
    query += ` ORDER BY a.name LIMIT ${limit}`

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
      `SELECT a.*, c.name as client_name, at.name as asset_type_name,
              c.autotask_company_id
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

// GET /api/assets/types — list asset types with counts
router.get('/types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT at.*, count(a.id) as asset_count
       FROM asset_types at
       LEFT JOIN assets a ON a.asset_type_id = at.id AND a.tenant_id = at.tenant_id
       WHERE at.tenant_id = $1
       GROUP BY at.id
       ORDER BY at.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset types' })
  }
})

// PATCH /api/assets/:id — update asset fields
router.patch('/:id', async (req, res) => {
  const {
    asset_type_id, name, serial_number, manufacturer, model,
    warranty_expiry, purchase_date, eol_date,
    notes, is_managed, is_active,
  } = req.body
  try {
    const result = await db.query(
      `UPDATE assets SET
         asset_type_id  = COALESCE($3, asset_type_id),
         name           = COALESCE($4, name),
         serial_number  = COALESCE($5, serial_number),
         manufacturer   = COALESCE($6, manufacturer),
         model          = COALESCE($7, model),
         warranty_expiry= COALESCE($8, warranty_expiry),
         purchase_date  = COALESCE($9, purchase_date),
         eol_date       = COALESCE($10, eol_date),
         notes          = COALESCE($11, notes),
         is_managed     = COALESCE($12, is_managed),
         is_active      = COALESCE($13, is_active),
         updated_at     = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        req.params.id, req.tenant.id,
        asset_type_id || null, name || null, serial_number || null,
        manufacturer || null, model || null,
        warranty_expiry || null, purchase_date || null, eol_date || null,
        notes !== undefined ? notes : null,
        is_managed !== undefined ? is_managed : null,
        is_active !== undefined ? is_active : null,
      ]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Asset not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[assets] patch error:', err.message)
    res.status(500).json({ error: 'Failed to update asset' })
  }
})

module.exports = router
