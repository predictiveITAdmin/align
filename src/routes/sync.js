const express = require('express')
const router = express.Router()
const { syncClients } = require('../services/autotaskSync')
const { syncAssets } = require('../services/autotaskAssetSync')
const { syncCSAT } = require('../services/csatSync')
const db = require('../db')

// Helper to get tenant ID (uses req.tenant from middleware, falls back to predictiveit)
async function getTenantId(req) {
  if (req.tenant?.id) return req.tenant.id
  const result = await db.query(`SELECT id FROM tenants WHERE slug = 'predictiveit'`)
  return result.rows[0]?.id
}

// POST /api/sync/clients — Autotask companies → clients
router.post('/clients', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncClients(tenantId)
    res.json({ status: 'ok', source: 'autotask', entity: 'clients', ...result })
  } catch (err) {
    console.error('[sync] clients error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/assets — Autotask ConfigurationItems → assets
router.post('/assets', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncAssets(tenantId)
    res.json({ status: 'ok', source: 'autotask', entity: 'assets', ...result })
  } catch (err) {
    console.error('[sync] assets error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/csat — Customer Thermometer → csat_responses
router.post('/csat', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncCSAT(tenantId)
    res.json({ status: 'ok', source: 'customer_thermometer', entity: 'csat_responses', ...result })
  } catch (err) {
    console.error('[sync] csat error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/all — run all syncs sequentially
router.post('/all', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })

    const results = {}
    results.clients = await syncClients(tenantId)
    results.assets = await syncAssets(tenantId)
    results.csat = await syncCSAT(tenantId)

    res.json({ status: 'ok', results })
  } catch (err) {
    console.error('[sync] all error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sync/status — get sync history
router.get('/status', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    const result = await db.query(
      `SELECT sl.*, ss.source_type, ss.display_name as source_name
       FROM sync_logs sl
       JOIN sync_sources ss ON ss.id = sl.sync_source_id
       WHERE sl.tenant_id = $1
       ORDER BY sl.started_at DESC
       LIMIT 50`,
      [tenantId]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
