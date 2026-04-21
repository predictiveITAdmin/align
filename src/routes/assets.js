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
             a.purchase_date, a.warranty_expiry, a.eol_date, a.warranty_source,
             a.ip_address, a.mac_address, a.is_online, a.is_active, a.is_managed,
             a.antivirus_status, a.patch_status, a.notes,
             a.primary_source, a.last_seen_at, a.last_seen_source,
             a.hostname, a.last_user, a.ram_bytes, a.storage_bytes, a.storage_free_bytes,
             a.cpu_description, a.cpu_cores, a.motherboard, a.display_adapters,
             a.autotask_ci_id, a.datto_rmm_device_id, a.it_glue_config_id, a.auvik_device_id,
             a.datto_rmm_data, a.it_glue_data, a.autotask_data, a.auvik_data,
             a.created_at, a.updated_at,
             c.name as client_name,
             at.name as asset_type_name, at.default_lifecycle_years
      FROM assets a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN asset_types at ON at.id = a.asset_type_id
      WHERE a.tenant_id = $1`
    const params = [req.tenant.id]

    // lifecycle param: 'decommissioned' returns inactive, everything else returns active
    const { lifecycle } = req.query
    if (lifecycle === 'decommissioned') {
      query += ` AND a.is_active = false`
    } else {
      query += ` AND a.is_active = true`
    }

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
       WHERE a.tenant_id = $1 AND a.is_active = true ${clientFilter}
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
       WHERE a.tenant_id = $1 AND a.is_active = true ${clientFilter}`,
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

// GET /api/assets/lifecycle-score — compute hardware lifecycle health score
// Score components: warranty coverage, asset age, RMM visibility, hardware data completeness
router.get('/lifecycle-score', async (req, res) => {
  const { client_id } = req.query
  try {
    const clientFilter = client_id ? 'AND a.client_id = $2' : ''
    const params = client_id ? [req.tenant.id, client_id] : [req.tenant.id]

    const result = await db.query(
      `SELECT
         count(*) as total,
         -- Warranty
         count(*) FILTER (WHERE warranty_expiry > NOW() + INTERVAL '90 days') as warranty_active,
         count(*) FILTER (WHERE warranty_expiry BETWEEN NOW() AND NOW() + INTERVAL '90 days') as warranty_expiring,
         count(*) FILTER (WHERE warranty_expiry < NOW()) as warranty_expired,
         count(*) FILTER (WHERE warranty_expiry IS NULL) as warranty_unknown,
         -- Age (using purchase_date or install_date from autotask)
         count(*) FILTER (WHERE purchase_date IS NOT NULL AND purchase_date > NOW() - INTERVAL '3 years') as age_under_3,
         count(*) FILTER (WHERE purchase_date IS NOT NULL AND purchase_date BETWEEN NOW() - INTERVAL '5 years' AND NOW() - INTERVAL '3 years') as age_3_to_5,
         count(*) FILTER (WHERE purchase_date IS NOT NULL AND purchase_date < NOW() - INTERVAL '5 years') as age_over_5,
         count(*) FILTER (WHERE purchase_date IS NULL) as age_unknown,
         -- RMM visibility (device types that should be in RMM)
         count(*) FILTER (WHERE datto_rmm_device_id IS NOT NULL) as in_rmm,
         count(*) FILTER (WHERE datto_rmm_device_id IS NOT NULL AND last_seen_at > NOW() - INTERVAL '7 days') as rmm_active,
         -- Hardware data completeness
         count(*) FILTER (WHERE manufacturer IS NOT NULL) as has_manufacturer,
         count(*) FILTER (WHERE cpu_description IS NOT NULL OR ram_bytes IS NOT NULL) as has_hw_specs,
         count(*) FILTER (WHERE serial_number IS NOT NULL AND LENGTH(serial_number) >= 4) as has_serial
       FROM assets a
       LEFT JOIN asset_types at ON at.id = a.asset_type_id
       WHERE a.tenant_id = $1 AND a.is_active = true ${clientFilter}`,
      params
    )

    const d = result.rows[0]
    const total = parseInt(d.total) || 0
    if (total === 0) return res.json({ data: null })

    // Score components (0–100 each)
    const pct = (n, denom) => denom > 0 ? Math.round((parseInt(n) / denom) * 100) : 0

    // Warranty score: active=100, expiring=50, expired=0, unknown=25
    const warrantyScore = total > 0 ? Math.round(
      (parseInt(d.warranty_active) * 100 +
       parseInt(d.warranty_expiring) * 50 +
       parseInt(d.warranty_expired) * 0 +
       parseInt(d.warranty_unknown) * 25) / total
    ) : 0

    // Age score: under 3yr=100, 3-5yr=60, over 5yr=20, unknown=50
    const knownAge = parseInt(d.age_under_3) + parseInt(d.age_3_to_5) + parseInt(d.age_over_5)
    const ageScore = total > 0 ? Math.round(
      (parseInt(d.age_under_3) * 100 +
       parseInt(d.age_3_to_5) * 60 +
       parseInt(d.age_over_5) * 20 +
       parseInt(d.age_unknown) * 50) / total
    ) : 0

    // RMM score: % assets with recent RMM check-in
    const rmmScore = pct(d.rmm_active, total)

    // Data completeness: have serial, make, hw specs
    const completenessScore = Math.round(
      (pct(d.has_manufacturer, total) + pct(d.has_hw_specs, total) + pct(d.has_serial, total)) / 3
    )

    // Weighted overall score
    const overall = Math.round(
      warrantyScore * 0.40 +
      ageScore      * 0.35 +
      rmmScore      * 0.15 +
      completenessScore * 0.10
    )

    res.json({
      data: {
        total,
        overall,
        components: {
          warranty:     { score: warrantyScore,     weight: 40, label: 'Warranty Coverage',
            active: parseInt(d.warranty_active), expiring: parseInt(d.warranty_expiring),
            expired: parseInt(d.warranty_expired), unknown: parseInt(d.warranty_unknown) },
          age:          { score: ageScore,           weight: 35, label: 'Asset Age',
            under_3: parseInt(d.age_under_3), age_3_to_5: parseInt(d.age_3_to_5),
            over_5: parseInt(d.age_over_5), unknown: parseInt(d.age_unknown) },
          rmm:          { score: rmmScore,           weight: 15, label: 'RMM Visibility',
            in_rmm: parseInt(d.in_rmm), active: parseInt(d.rmm_active) },
          completeness: { score: completenessScore,  weight: 10, label: 'Data Completeness',
            has_manufacturer: parseInt(d.has_manufacturer),
            has_hw_specs: parseInt(d.has_hw_specs), has_serial: parseInt(d.has_serial) },
        },
      },
    })
  } catch (err) {
    console.error('[assets] lifecycle-score error:', err.message)
    res.status(500).json({ error: 'Failed to compute lifecycle score' })
  }
})

// GET /api/assets/types — list asset types with counts  (MUST be before /:id)
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

// PATCH /api/assets/:id — update asset fields
router.patch('/:id', async (req, res) => {
  const {
    client_id, asset_type_id, name, serial_number, manufacturer, model,
    warranty_expiry, purchase_date, eol_date,
    notes, is_managed, is_active,
  } = req.body
  try {
    // Validate client_id belongs to this tenant if provided
    if (client_id) {
      const clientCheck = await db.query(
        'SELECT id FROM clients WHERE id = $1 AND tenant_id = $2',
        [client_id, req.tenant.id]
      )
      if (!clientCheck.rows.length) return res.status(400).json({ error: 'Invalid client' })
    }
    const result = await db.query(
      `UPDATE assets SET
         client_id      = COALESCE($3, client_id),
         asset_type_id  = COALESCE($4, asset_type_id),
         name           = COALESCE($5, name),
         serial_number  = COALESCE($6, serial_number),
         manufacturer   = COALESCE($7, manufacturer),
         model          = COALESCE($8, model),
         warranty_expiry= COALESCE($9, warranty_expiry),
         purchase_date  = COALESCE($10, purchase_date),
         eol_date       = COALESCE($11, eol_date),
         notes          = COALESCE($12, notes),
         is_managed     = COALESCE($13, is_managed),
         is_active      = COALESCE($14, is_active),
         updated_at     = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        req.params.id, req.tenant.id,
        client_id || null,
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

// POST /api/assets/bulk — bulk update multiple assets
// Body: { ids: string[], action: 'mark_inactive'|'mark_active'|'set_type'|'set_client', value?: any }
router.post('/bulk', async (req, res) => {
  const { ids, action, value } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 assets per bulk operation' })
  }

  try {
    let result
    switch (action) {
      case 'mark_inactive':
        result = await db.query(
          `UPDATE assets SET is_active = false, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2
           RETURNING id`,
          [ids, req.tenant.id]
        )
        break

      case 'mark_active':
        result = await db.query(
          `UPDATE assets SET is_active = true, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2
           RETURNING id`,
          [ids, req.tenant.id]
        )
        break

      case 'set_type': {
        if (!value) return res.status(400).json({ error: 'value (asset_type_id) required for set_type' })
        // Verify type belongs to tenant
        const typeCheck = await db.query(
          'SELECT id FROM asset_types WHERE id = $1 AND tenant_id = $2',
          [value, req.tenant.id]
        )
        if (!typeCheck.rows.length) return res.status(400).json({ error: 'Invalid asset type' })
        result = await db.query(
          `UPDATE assets SET asset_type_id = $3, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2
           RETURNING id`,
          [ids, req.tenant.id, value]
        )
        break
      }

      case 'set_client': {
        if (!value) return res.status(400).json({ error: 'value (client_id) required for set_client' })
        const clientCheck = await db.query(
          'SELECT id FROM clients WHERE id = $1 AND tenant_id = $2',
          [value, req.tenant.id]
        )
        if (!clientCheck.rows.length) return res.status(400).json({ error: 'Invalid client' })
        result = await db.query(
          `UPDATE assets SET client_id = $3, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2
           RETURNING id`,
          [ids, req.tenant.id, value]
        )
        break
      }

      case 'clear_warranty':
        result = await db.query(
          `UPDATE assets SET warranty_expiry = NULL, warranty_source = NULL, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2
           RETURNING id`,
          [ids, req.tenant.id]
        )
        break

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    res.json({ updated: result.rows.length, ids: result.rows.map(r => r.id) })
  } catch (err) {
    console.error('[assets] bulk error:', err.message)
    res.status(500).json({ error: 'Bulk operation failed' })
  }
})

module.exports = router
