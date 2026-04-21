const express = require('express')
const router = express.Router()
const db = require('../db')
const { runWarrantyLookup, getDellToken, getCiscoToken, getMerakiOrgs } = require('../services/warrantyLookupService')

// GET /api/warranty-lookup/config — fetch current config + detected manufacturers
router.get('/config', async (req, res) => {
  try {
    const [settingsRow, mfrRow] = await Promise.all([
      db.query(`SELECT warranty_lookup_config FROM tenant_settings WHERE tenant_id = $1`, [req.tenant.id]),
      db.query(`
        SELECT
          COALESCE(manufacturer, datto_rmm_data->>'manufacturer', 'Unknown') AS mfr,
          COUNT(*) AS cnt
        FROM assets
        WHERE tenant_id = $1 AND is_active = true
          AND (manufacturer IS NOT NULL OR datto_rmm_data->>'manufacturer' IS NOT NULL)
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 15
      `, [req.tenant.id]),
    ])
    const config = settingsRow.rows[0]?.warranty_lookup_config || {}
    res.json({ data: { config, manufacturers: mfrRow.rows } })
  } catch (err) {
    console.error('[warranty-lookup] config error:', err.message)
    res.status(500).json({ error: 'Failed to fetch config' })
  }
})

// PATCH /api/warranty-lookup/config — save config (API keys, enabled flags)
router.patch('/config', async (req, res) => {
  const { config } = req.body
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Invalid config' })
  try {
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, warranty_lookup_config)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id) DO UPDATE SET
        warranty_lookup_config = $2, updated_at = NOW()
    `, [req.tenant.id, JSON.stringify(config)])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' })
  }
})

// POST /api/warranty-lookup/test-dell — test Dell credentials
router.post('/test-dell', async (req, res) => {
  const { client_id, client_secret } = req.body
  if (!client_id || !client_secret) return res.status(400).json({ error: 'client_id and client_secret required' })
  try {
    const token = await getDellToken(client_id, client_secret)
    res.json({ ok: true, message: 'Dell credentials valid — token acquired' })
  } catch (err) {
    res.status(400).json({ ok: false, error: `Dell auth failed: ${err.response?.data?.error_description || err.message}` })
  }
})

// POST /api/warranty-lookup/test-meraki — test Meraki API key
router.post('/test-meraki', async (req, res) => {
  const { api_key } = req.body
  if (!api_key) return res.status(400).json({ error: 'api_key required' })
  try {
    const orgs = await getMerakiOrgs(api_key)
    res.json({ ok: true, message: `Valid — ${orgs.length} organization(s) accessible` })
  } catch (err) {
    res.status(400).json({ ok: false, error: `Meraki auth failed: ${err.response?.status === 401 ? 'Invalid API key' : err.message}` })
  }
})

// POST /api/warranty-lookup/test-cisco — test Cisco DevNet credentials
router.post('/test-cisco', async (req, res) => {
  const { client_id, client_secret } = req.body
  if (!client_id || !client_secret) return res.status(400).json({ error: 'client_id and client_secret required' })
  try {
    const token = await getCiscoToken(client_id, client_secret)
    res.json({ ok: true, message: 'Cisco credentials valid — token acquired' })
  } catch (err) {
    res.status(400).json({ ok: false, error: `Cisco auth failed: ${err.response?.data?.error_description || err.message}` })
  }
})

// POST /api/warranty-lookup/run — trigger lookup (optionally for one manufacturer)
router.post('/run', async (req, res) => {
  const { manufacturer } = req.body
  try {
    // Kick off async (don't await — may take minutes for large inventories)
    runWarrantyLookup(req.tenant.id, manufacturer || null)
      .then(stats => console.log('[warranty-lookup] run complete:', stats))
      .catch(err => console.error('[warranty-lookup] run error:', err.message))
    res.json({ ok: true, message: 'Lookup started in background' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to start lookup' })
  }
})

// GET /api/warranty-lookup/log — recent lookup history
router.get('/log', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, ran_at, manufacturer, total, updated, skipped, errors, status
      FROM warranty_lookup_log
      WHERE tenant_id = $1
      ORDER BY ran_at DESC LIMIT 20
    `, [req.tenant.id])
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log' })
  }
})

module.exports = router
