const express = require('express')
const router = express.Router()
const { syncClients } = require('../services/autotaskSync')
const { syncAssets } = require('../services/autotaskAssetSync')
const { syncCSAT } = require('../services/csatSync')
const { syncMITP } = require('../services/mitpSync')
const { syncScalePad } = require('../services/scalepadSync')
const { syncDattoRmm } = require('../services/dattoRmmSync')
const { syncItGlue } = require('../services/itGlueSync')
const { syncSaasAlerts } = require('../services/saasAlertsSync')
const { syncAuvik } = require('../services/auvikSync')
const { syncContacts } = require('../services/autotaskContactsSync')
const { syncSoftware } = require('../services/softwareSync')
const { deduplicateAssets } = require('../services/assetDedup')
const { runAllSyncs } = require('../services/scheduler')
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

// POST /api/sync/mitp — MyITProcess standards + recommendations import
router.post('/mitp', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncMITP(tenantId)
    res.json({ status: 'ok', source: 'myitprocess', entity: 'standards', ...result })
  } catch (err) {
    console.error('[sync] mitp error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/scalepad — ScalePad templates + assessments import
router.post('/scalepad', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncScalePad(tenantId)
    res.json({ status: 'ok', source: 'scalepad', entity: 'standards', ...result })
  } catch (err) {
    console.error('[sync] scalepad error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/datto-rmm — Datto RMM device sync
router.post('/datto-rmm', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncDattoRmm(tenantId)
    res.json({ status: 'ok', source: 'datto_rmm', entity: 'assets', ...result })
  } catch (err) {
    console.error('[sync] datto-rmm error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/it-glue — IT Glue configurations sync
router.post('/it-glue', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncItGlue(tenantId)
    res.json({ status: 'ok', source: 'it_glue', entity: 'assets', ...result })
  } catch (err) {
    console.error('[sync] it-glue error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/saas-alerts — SaaS Alerts license sync
router.post('/saas-alerts', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncSaasAlerts(tenantId)
    res.json({ status: 'ok', source: 'saas_alerts', entity: 'saas_licenses', ...result })
  } catch (err) {
    console.error('[sync] saas-alerts error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/auvik — Auvik network device sync
router.post('/auvik', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncAuvik(tenantId)
    res.json({ status: 'ok', source: 'auvik', entity: 'assets', ...result })
  } catch (err) {
    console.error('[sync] auvik error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/dedup-assets — merge duplicate asset records across sources
router.post('/dedup-assets', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await deduplicateAssets(tenantId)
    res.json({ status: 'ok', ...result })
  } catch (err) {
    console.error('[sync] dedup-assets error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/software — Datto RMM software inventory sync
router.post('/software', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncSoftware(tenantId)
    res.json({ status: 'ok', source: 'datto_rmm', entity: 'software', ...result })
  } catch (err) {
    console.error('[sync] software error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/contacts — Autotask contacts sync
router.post('/contacts', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })
    const result = await syncContacts(tenantId)
    res.json({ status: 'ok', source: 'autotask', entity: 'contacts', ...result })
  } catch (err) {
    console.error('[sync] contacts error:', err.message)
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
    results.mitp = await syncMITP(tenantId)
    results.scalepad = await syncScalePad(tenantId)
    results.dattoRmm = await syncDattoRmm(tenantId)
    results.itGlue = await syncItGlue(tenantId)
    results.saasAlerts = await syncSaasAlerts(tenantId)
    results.auvik = await syncAuvik(tenantId)
    results.contacts = await syncContacts(tenantId)
    results.software = await syncSoftware(tenantId)

    res.json({ status: 'ok', results })
  } catch (err) {
    console.error('[sync] all error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sync/status — get sync history
// POST /api/sync/backfill-hardware — re-resolve Autotask picklist IDs for existing assets
// Fetches picklists once then backfills manufacturer, model, cpu_description, motherboard,
// display_adapters, last_user, mac_address, ram_bytes, storage_bytes, hostname for any
// asset that has autotask_data but still has null resolved fields
router.post('/backfill-hardware', async (req, res) => {
  try {
    const tenantId = await getTenantId(req)
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' })

    // Build Autotask client from stored or env credentials
    const axios = require('axios')
    const sourceRow = await db.query(
      `SELECT credentials FROM sync_sources WHERE tenant_id = $1 AND source_type = 'autotask'`,
      [tenantId]
    )
    const creds = sourceRow.rows[0]?.credentials || {}
    const zone = creds.zone || process.env.AUTOTASK_ZONE || 'webservices1'
    const user = creds.api_user || process.env.AUTOTASK_API_USER
    const secret = creds.api_secret || process.env.AUTOTASK_API_SECRET
    const code = creds.integration_code || process.env.AUTOTASK_INTEGRATION_CODE
    if (!user || !secret) return res.json({ status: 'error', message: 'Missing Autotask credentials' })

    const client = axios.create({
      baseURL: `https://${zone}.autotask.net/ATServicesRest/V1.0`,
      headers: { ApiIntegrationCode: code, UserName: user, Secret: secret, 'Content-Type': 'application/json' },
    })

    // Fetch picklists
    const fieldsRes = await client.get('/ConfigurationItems/entityInformation/fields')
    const picklistMap = {}
    for (const f of (fieldsRes.data?.fields || [])) {
      if (f.picklistValues?.length) {
        picklistMap[f.name] = {}
        for (const v of f.picklistValues) picklistMap[f.name][String(v.value)] = v.label
      }
    }
    function resolve(field, id) {
      if (id === null || id === undefined || id === 0 || id === '0') return null
      return picklistMap[field]?.[String(id)] || null
    }

    // Find assets with autotask_data that are still missing resolved hardware fields
    const assets = await db.query(
      `SELECT id, autotask_data FROM assets
       WHERE tenant_id = $1
         AND autotask_data IS NOT NULL
         AND autotask_data != '{}'
         AND (manufacturer IS NULL OR model IS NULL OR cpu_description IS NULL)
       LIMIT 10000`,
      [tenantId]
    )

    let updated = 0, skipped = 0
    for (const asset of assets.rows) {
      const d = asset.autotask_data || {}
      const manufacturer  = resolve('rmmDeviceAuditManufacturerID', d.rmmDeviceAuditManufacturerID)
      const model         = resolve('rmmDeviceAuditModelID', d.rmmDeviceAuditModelID)
      const cpuDesc       = resolve('rmmDeviceAuditProcessorID', d.rmmDeviceAuditProcessorID)
      const motherboard   = resolve('rmmDeviceAuditMotherboardID', d.rmmDeviceAuditMotherboardID)
      const displayAdapt  = resolve('rmmDeviceAuditDisplayAdaptorID', d.rmmDeviceAuditDisplayAdaptorID)
      const lastUser      = d.rmmDeviceAuditLastUser || null
      const hostname      = d.rmmDeviceAuditHostname || null
      const ramBytes      = d.rmmDeviceAuditMemoryBytes ? Number(d.rmmDeviceAuditMemoryBytes) || null : null
      const storageBytes  = d.rmmDeviceAuditStorageBytes ? Number(d.rmmDeviceAuditStorageBytes) || null : null
      const ipRaw         = d.rmmDeviceAuditIPAddress || null
      const ipAddress     = ipRaw && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipRaw) ? ipRaw : null
      const macRaw        = d.rmmDeviceAuditMacAddress || null
      const macAddress    = macRaw && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(macRaw) ? macRaw : null

      if (!manufacturer && !model && !cpuDesc && !ramBytes) { skipped++; continue }

      await db.query(
        `UPDATE assets SET
           manufacturer    = COALESCE(manufacturer, $2),
           model           = COALESCE(model, $3),
           cpu_description = COALESCE(cpu_description, $4),
           motherboard     = COALESCE(motherboard, $5),
           display_adapters= COALESCE(display_adapters, $6),
           last_user       = COALESCE(last_user, $7),
           hostname        = COALESCE(hostname, $8),
           ram_bytes       = COALESCE(ram_bytes, $9),
           storage_bytes   = COALESCE(storage_bytes, $10),
           ip_address      = COALESCE(ip_address, $11::inet),
           mac_address     = COALESCE(mac_address, $12),
           updated_at      = NOW()
         WHERE id = $1`,
        [asset.id, manufacturer, model, cpuDesc, motherboard, displayAdapt,
         lastUser, hostname, ramBytes, storageBytes, ipAddress, macAddress]
      )
      updated++
    }

    console.log(`[backfill-hardware] Done: ${updated} updated, ${skipped} skipped`)
    res.json({ status: 'ok', checked: assets.rows.length, updated, skipped })
  } catch (err) {
    console.error('[backfill-hardware] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sync/run-all — manually trigger a full scheduled sync cycle
router.post('/run-all', async (req, res) => {
  res.json({ status: 'started', message: 'Full sync cycle triggered — check server logs for progress' })
  runAllSyncs().catch(err => console.error('[sync] run-all error:', err.message))
})

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
