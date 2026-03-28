const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// All integration definitions — maps source_type to display info and required fields
const INTEGRATION_DEFS = {
  autotask: {
    name: 'Autotask PSA',
    description: 'Clients, assets (ConfigurationItems), contracts, tickets, companies',
    icon: 'server',
    category: 'PSA',
    sync_entities: ['clients', 'assets', 'contacts', 'contracts'],
    credential_fields: [
      { key: 'api_user', label: 'API Username', type: 'text', required: true },
      { key: 'api_secret', label: 'API Secret', type: 'password', required: true },
      { key: 'integration_code', label: 'Integration Code', type: 'text', required: true },
      { key: 'zone', label: 'Zone', type: 'text', placeholder: 'webservices1', required: true },
    ],
  },
  datto_rmm: {
    name: 'Datto RMM',
    description: 'Live device monitoring, warranty dates, patch/AV status, UDFs',
    icon: 'monitor',
    category: 'RMM',
    sync_entities: ['devices'],
    credential_fields: [
      { key: 'api_url', label: 'API URL', type: 'text', placeholder: 'https://concord-api.centrastage.net', required: true },
      { key: 'api_key', label: 'API Key', type: 'text', required: true },
      { key: 'api_secret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  it_glue: {
    name: 'IT Glue',
    description: 'Configurations, contacts, flexible assets, domains, locations',
    icon: 'book-open',
    category: 'Documentation',
    sync_entities: ['configurations', 'contacts', 'domains'],
    credential_fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://api.itglue.com', required: false },
    ],
  },
  scalepad: {
    name: 'ScalePad / Lifecycle Manager X',
    description: 'Assessment templates, initiatives, goals, meetings, hardware assets',
    icon: 'shield-check',
    category: 'vCIO',
    sync_entities: ['assessments', 'initiatives', 'goals', 'hardware_assets'],
    credential_fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  myitprocess: {
    name: 'MyITProcess',
    description: 'Reviews, findings, recommendations, initiatives',
    icon: 'clipboard-list',
    category: 'vCIO',
    sync_entities: ['reviews', 'findings', 'recommendations', 'initiatives'],
    credential_fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  saas_alerts: {
    name: 'SaaS Alerts',
    description: 'M365/Google per-user license assignments, security events',
    icon: 'shield-alert',
    category: 'Security',
    sync_entities: ['customers', 'users', 'licenses'],
    credential_fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'partner_id', label: 'Partner ID', type: 'text', required: false },
    ],
  },
  auvik: {
    name: 'Auvik',
    description: 'Network device discovery — firewalls, switches, APs, topology',
    icon: 'wifi',
    category: 'Network',
    sync_entities: ['tenants', 'devices', 'networks'],
    credential_fields: [
      { key: 'api_user', label: 'API Username (email)', type: 'text', required: true },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://auvikapi.us6.my.auvik.com/v1', required: true },
    ],
  },
  customer_thermometer: {
    name: 'Customer Thermometer',
    description: 'CSAT survey responses — per ticket/client satisfaction scoring',
    icon: 'thermometer',
    category: 'CSAT',
    sync_entities: ['responses'],
    credential_fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
}

// GET /api/integrations — list all integrations with status
router.get('/', async (req, res) => {
  try {
    // Get configured sync sources for this tenant
    const sources = await db.query(
      `SELECT ss.*,
              (SELECT sl.status FROM sync_logs sl WHERE sl.sync_source_id = ss.id ORDER BY sl.started_at DESC LIMIT 1) as last_sync_status,
              (SELECT sl.started_at FROM sync_logs sl WHERE sl.sync_source_id = ss.id ORDER BY sl.started_at DESC LIMIT 1) as last_sync_at,
              (SELECT sl.records_fetched FROM sync_logs sl WHERE sl.sync_source_id = ss.id AND sl.status = 'completed' ORDER BY sl.started_at DESC LIMIT 1) as last_records_fetched
       FROM sync_sources ss
       WHERE ss.tenant_id = $1
       ORDER BY ss.display_name`,
      [req.tenant.id]
    )

    // Build response with all integrations (configured or not)
    const configuredMap = {}
    for (const s of sources.rows) configuredMap[s.source_type] = s

    const integrations = Object.entries(INTEGRATION_DEFS).map(([type, def]) => {
      const configured = configuredMap[type]
      return {
        type,
        ...def,
        is_configured: !!configured,
        is_enabled: configured?.is_enabled ?? false,
        last_sync_status: configured?.last_sync_status || null,
        last_sync_at: configured?.last_sync_at || null,
        last_records_fetched: configured?.last_records_fetched || null,
        source_id: configured?.id || null,
        // Don't expose credential values — just show which fields are set
        credentials_set: configured
          ? Object.keys(configured.credentials || {}).filter(k => configured.credentials[k])
          : [],
      }
    })

    res.json({ data: integrations })
  } catch (err) {
    console.error('[integrations] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch integrations' })
  }
})

// GET /api/integrations/definitions — get field definitions for all integration types
router.get('/definitions', (req, res) => {
  res.json({ data: INTEGRATION_DEFS })
})

// PUT /api/integrations/:type — create or update integration credentials
router.put('/:type', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  const { type } = req.params
  const { credentials, config, is_enabled } = req.body

  if (!INTEGRATION_DEFS[type]) {
    return res.status(400).json({ error: `Unknown integration type: ${type}` })
  }

  try {
    const result = await db.query(
      `INSERT INTO sync_sources (tenant_id, source_type, display_name, credentials, config, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, source_type)
       DO UPDATE SET
         credentials = COALESCE($4, sync_sources.credentials),
         config = COALESCE($5, sync_sources.config),
         is_enabled = COALESCE($6, sync_sources.is_enabled),
         updated_at = NOW()
       RETURNING id, source_type, display_name, is_enabled, config, created_at, updated_at`,
      [
        req.tenant.id,
        type,
        INTEGRATION_DEFS[type].name,
        credentials ? JSON.stringify(credentials) : '{}',
        config ? JSON.stringify(config) : '{}',
        is_enabled ?? true,
      ]
    )

    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[integrations] save error:', err.message)
    res.status(500).json({ error: 'Failed to save integration' })
  }
})

// POST /api/integrations/:type/test — test an integration connection
router.post('/:type/test', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  const { type } = req.params

  if (!INTEGRATION_DEFS[type]) {
    return res.status(400).json({ error: `Unknown integration type: ${type}` })
  }

  // Get stored credentials
  const source = await db.query(
    `SELECT credentials FROM sync_sources WHERE tenant_id = $1 AND source_type = $2`,
    [req.tenant.id, type]
  )

  if (!source.rows.length) {
    return res.status(400).json({ error: 'Integration not configured yet' })
  }

  // TODO: Implement per-integration connection tests
  // For now, just return success if credentials exist
  const creds = source.rows[0].credentials || {}
  const hasRequiredCreds = INTEGRATION_DEFS[type].credential_fields
    .filter(f => f.required)
    .every(f => creds[f.key])

  if (!hasRequiredCreds) {
    return res.json({ status: 'error', message: 'Missing required credentials' })
  }

  res.json({ status: 'ok', message: 'Credentials configured. Use sync to test connection.' })
})

// GET /api/integrations/:type/history — sync history for an integration
router.get('/:type/history', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sl.*
       FROM sync_logs sl
       JOIN sync_sources ss ON ss.id = sl.sync_source_id
       WHERE sl.tenant_id = $1 AND ss.source_type = $2
       ORDER BY sl.started_at DESC
       LIMIT 25`,
      [req.tenant.id, req.params.type]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync history' })
  }
})

// DELETE /api/integrations/:type — disable/remove an integration
router.delete('/:type', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    await db.query(
      `UPDATE sync_sources SET is_enabled = false, updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = $2`,
      [req.tenant.id, req.params.type]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable integration' })
  }
})

module.exports = router
