const express = require('express')
const router = express.Router()
const { syncClients } = require('../services/autotaskSync')
const db = require('../db')

// POST /api/sync/clients — trigger Autotask client sync
router.post('/clients', async (req, res) => {
  try {
    // Get predictiveIT tenant (hardcoded for now, auth will scope this later)
    const tenant = await db.query(`SELECT id FROM tenants WHERE slug = 'predictiveit'`)
    if (!tenant.rows.length) return res.status(404).json({ error: 'Tenant not found' })

    const tenantId = tenant.rows[0].id

    // Ensure sync source exists
    await db.query(
      `INSERT INTO sync_sources (tenant_id, source_type, display_name, config, is_enabled)
       VALUES ($1, 'autotask', 'Autotask PSA', '{}', true)
       ON CONFLICT (tenant_id, source_type) DO NOTHING`,
      [tenantId]
    )

    const result = await syncClients(tenantId)
    res.json({ status: 'ok', ...result })
  } catch (err) {
    console.error('[sync] clients error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sync/status — get sync history
router.get('/status', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sl.*, ss.source_type
       FROM sync_logs sl
       JOIN sync_sources ss ON ss.id = sl.sync_source_id
       ORDER BY sl.started_at DESC
       LIMIT 20`
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
