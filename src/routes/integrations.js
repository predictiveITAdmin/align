const express = require('express')
const router = express.Router()
const db = require('../db')
const axios = require('axios')
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
    sync_entities: ['devices', 'software'],
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

// POST /api/integrations/:type/test — test an integration connection (real API ping)
router.post('/:type/test', async (req, res) => {
  const { type } = req.params
  if (!INTEGRATION_DEFS[type]) return res.status(400).json({ error: `Unknown integration type: ${type}` })

  // Load stored credentials (per-tenant override), fall back to env vars
  const sourceRow = await db.query(
    `SELECT credentials FROM sync_sources WHERE tenant_id = $1 AND source_type = $2`,
    [req.tenant.id, type]
  )
  const stored = sourceRow.rows[0]?.credentials || {}
  function c(key, envVar) { return stored[key] || (envVar ? process.env[envVar] : null) || null }

  try {
    switch (type) {
      case 'autotask': {
        const zone = c('zone', 'AUTOTASK_ZONE') || 'webservices1'
        const user = c('api_user', 'AUTOTASK_API_USER')
        const secret = c('api_secret', 'AUTOTASK_API_SECRET')
        const code = c('integration_code', 'AUTOTASK_INTEGRATION_CODE')
        if (!user || !secret) return res.json({ status: 'error', message: 'Missing API credentials (env: AUTOTASK_API_USER / AUTOTASK_API_SECRET)' })
        const r = await axios.post(
          `https://${zone}.autotask.net/ATServicesRest/V1.0/ConfigurationItems/query`,
          { filter: [{ field: 'id', op: 'gt', value: 0 }], maxRecords: 1 },
          { headers: { ApiIntegrationCode: code, UserName: user, Secret: secret, 'Content-Type': 'application/json' }, timeout: 10000 }
        )
        const count = r.data?.items?.length ?? '?'
        return res.json({ status: 'ok', message: `Connected — Autotask PSA responding (${count} sample records)` })
      }

      case 'datto_rmm': {
        const apiUrl = c('api_url', 'DATTO_RMM_API_URL')
        const apiKey = c('api_key', 'DATTO_RMM_API_KEY')
        const apiSecret = c('api_secret', 'DATTO_RMM_API_SECRET')
        if (!apiUrl || !apiKey) return res.json({ status: 'error', message: 'Missing API credentials (env: DATTO_RMM_API_URL / DATTO_RMM_API_KEY)' })
        const tokenRes = await axios.post(
          `${apiUrl}/auth/oauth/token`,
          `grant_type=password&username=${encodeURIComponent(apiKey)}&password=${encodeURIComponent(apiSecret)}`,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        )
        if (!tokenRes.data.access_token) return res.json({ status: 'error', message: 'Token request succeeded but no access_token returned' })
        return res.json({ status: 'ok', message: 'Connected — Datto RMM OAuth token acquired' })
      }

      case 'it_glue': {
        const apiKey = c('api_key', 'IT_GLUE_API_KEY')
        const baseUrl = c('base_url', 'IT_GLUE_BASE_URL') || 'https://api.itglue.com'
        if (!apiKey) return res.json({ status: 'error', message: 'Missing API key (env: IT_GLUE_API_KEY)' })
        const r = await axios.get(`${baseUrl}/organizations?page[size]=1`, {
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/vnd.api+json' }, timeout: 10000
        })
        const count = r.data?.meta?.total_count ?? '?'
        return res.json({ status: 'ok', message: `Connected — IT Glue responding (${count} organizations)` })
      }

      case 'scalepad': {
        const apiKey = c('api_key', 'SCALEPAD_API_KEY')
        if (!apiKey) return res.json({ status: 'error', message: 'Missing API key (env: SCALEPAD_API_KEY)' })
        const r = await axios.get('https://api.scalepad.com/v2/companies', {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000,
          params: { page: 1, per_page: 1 }
        })
        return res.json({ status: 'ok', message: `Connected — ScalePad API responding` })
      }

      case 'myitprocess': {
        const apiKey = c('api_key', 'MYITPROCESS_API_KEY')
        if (!apiKey) return res.json({ status: 'error', message: 'Missing API key (env: MYITPROCESS_API_KEY)' })
        await axios.get('https://api.myitprocess.com/v1/clients', {
          headers: { 'x-api-key': apiKey }, timeout: 10000,
          params: { pageNumber: 1, pageSize: 1 }
        })
        return res.json({ status: 'ok', message: 'Connected — MyITProcess API responding' })
      }

      case 'saas_alerts': {
        const apiKey = c('api_key', 'SAAS_ALERTS_API_KEY')
        if (!apiKey) return res.json({ status: 'error', message: 'Missing API key (env: SAAS_ALERTS_API_KEY)' })
        await axios.get('https://app.saasalerts.com/api/v1/customers', {
          headers: { apiKey }, timeout: 10000
        })
        return res.json({ status: 'ok', message: 'Connected — SaaS Alerts API responding' })
      }

      case 'auvik': {
        const apiUser = c('api_user', 'AUVIK_API_USER')
        const apiKey = c('api_key', 'AUVIK_API_KEY')
        const baseUrl = c('base_url', 'AUVIK_BASE_URL') || 'https://auvikapi.us1.my.auvik.com/v1'
        if (!apiUser || !apiKey) return res.json({ status: 'error', message: 'Missing credentials (env: AUVIK_API_USER / AUVIK_API_KEY)' })
        const r = await axios.get(`${baseUrl}/tenants`, {
          auth: { username: apiUser, password: apiKey }, timeout: 10000
        })
        const count = r.data?.data?.length ?? '?'
        return res.json({ status: 'ok', message: `Connected — Auvik responding (${count} tenants)` })
      }

      case 'customer_thermometer': {
        const apiKey = c('api_key', 'CUSTOMER_THERMOMETER_API_KEY')
        if (!apiKey) return res.json({ status: 'error', message: 'Missing API key (env: CUSTOMER_THERMOMETER_API_KEY)' })
        await axios.get(`https://api.customerthermometer.com/v1/thermometers?apiKey=${apiKey}`, { timeout: 10000 })
        return res.json({ status: 'ok', message: 'Connected — Customer Thermometer API responding' })
      }

      default:
        return res.json({ status: 'error', message: 'No test implemented for this integration' })
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.response?.data?.errors?.[0]?.detail || err.message
    const code = err.response?.status
    return res.json({ status: 'error', message: code ? `HTTP ${code}: ${msg}` : msg })
  }
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
