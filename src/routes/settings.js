const express = require('express')
const router = express.Router()
const axios   = require('axios')
const db = require('../db')
const { getLifecycleConfig, saveLifecycleConfig, runLifecycleCheck } = require('../services/assetLifecycleService')
const { fetchPax8Companies } = require('../services/pax8Sync')
const { getCompanyPicklists, buildClient: buildAtClient } = require('../services/autotaskSync')

// ─── External company list helpers (for mapping dropdowns + auto-map) ─────────

async function fetchSaasAlertsCustomers() {
  if (!process.env.SAASALERTS_API_KEY) throw new Error('SaaS Alerts API key not configured')
  const SA_BASE = 'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1'
  const res = await axios.get(`${SA_BASE}/customers`, {
    headers: { api_key: process.env.SAASALERTS_API_KEY, 'Content-Type': 'application/json' },
  })
  return (res.data || [])
    .map(c => ({ id: String(c.id || c.customerId || ''), name: c.name || c.customerName || c.companyName || '' }))
    .filter(c => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchAuvikTenants() {
  if (!process.env.AUVIK_API_KEY || !process.env.AUVIK_API_USER) throw new Error('Auvik not configured')
  const baseURL = process.env.AUVIK_BASE_URL || 'https://auvikapi.us6.my.auvik.com/v1'
  const res = await axios.get(`${baseURL}/tenants`, {
    auth: { username: process.env.AUVIK_API_USER, password: process.env.AUVIK_API_KEY },
    headers: { 'Content-Type': 'application/json' },
    maxRedirects: 5,
  })
  return (res.data?.data || [])
    .map(t => ({ id: t.id, name: t.attributes?.displayName || t.attributes?.domainPrefix || t.id }))
    .filter(c => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchItGlueOrgs() {
  if (!process.env.ITGLUE_API_KEY) throw new Error('IT Glue API key not configured')
  const res = await axios.get('https://api.itglue.com/organizations', {
    params: { 'filter[active]': true, 'page[size]': 500 },
    headers: { 'x-api-key': process.env.ITGLUE_API_KEY, 'Content-Type': 'application/vnd.api+json' },
  })
  return (res.data?.data || [])
    .map(o => ({ id: String(o.id), name: o.attributes?.name || '' }))
    .filter(c => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchDattoRmmSites() {
  if (!process.env.DATTO_RMM_API_URL || !process.env.DATTO_RMM_API_KEY) throw new Error('Datto RMM not configured')
  const apiUrl = process.env.DATTO_RMM_API_URL
  const tokenRes = await axios.post(
    `${apiUrl}/auth/oauth/token`,
    `grant_type=password&username=${encodeURIComponent(process.env.DATTO_RMM_API_KEY)}&password=${encodeURIComponent(process.env.DATTO_RMM_API_SECRET)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from('public-client:public').toString('base64') } }
  )
  const token = tokenRes.data.access_token
  let allSites = [], page = 0, hasMore = true
  while (hasMore) {
    const res = await axios.get(`${apiUrl}/api/v2/account/sites`, {
      params: { max: 250, page },
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const sites = res.data?.sites || []
    allSites = allSites.concat(sites)
    hasMore = sites.length === 250
    page++
  }
  return allSites
    .map(s => ({ id: s.uid || String(s.id || ''), name: s.name || '' }))
    .filter(c => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Name-normalise for fuzzy matching
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }

function matchConfidence(extName, clientName) {
  const e = norm(extName), c = norm(clientName)
  if (!e || !c) return 0
  if (e === c) return 99
  if (e.includes(c) || c.includes(e)) return 80
  return 0
}

// ─── GET /api/settings/autotask-ci-types ─────────────────────────────────────
// List all Autotask CI types with their sync toggle state
router.get('/autotask-ci-types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, at.name as maps_to_name
       FROM autotask_ci_sync_types t
       LEFT JOIN asset_types at ON at.id = t.maps_to_asset_type_id
       WHERE t.tenant_id = $1
       ORDER BY t.ci_type_name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[settings] ci-types error:', err.message)
    res.status(500).json({ error: 'Failed to fetch CI types' })
  }
})

// ─── PATCH /api/settings/autotask-ci-types/:id ───────────────────────────────
// Toggle is_synced or update maps_to_asset_type_id for a CI type
router.patch('/autotask-ci-types/:id', async (req, res) => {
  const { is_synced, maps_to_asset_type_id } = req.body
  try {
    const result = await db.query(
      `UPDATE autotask_ci_sync_types
       SET is_synced              = COALESCE($3, is_synced),
           maps_to_asset_type_id  = CASE WHEN $4::text IS NOT NULL THEN $4::uuid ELSE maps_to_asset_type_id END,
           updated_at             = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id,
       is_synced !== undefined ? is_synced : null,
       maps_to_asset_type_id !== undefined ? maps_to_asset_type_id : null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[settings] ci-type patch error:', err.message)
    res.status(500).json({ error: 'Failed to update CI type' })
  }
})

// ─── PATCH /api/settings/autotask-ci-types/bulk ──────────────────────────────
// Bulk enable/disable — body: { ids: [...], is_synced: bool } or { all: true, is_synced: bool }
router.patch('/autotask-ci-types', async (req, res) => {
  const { ids, all: allFlag, is_synced } = req.body
  try {
    if (allFlag) {
      await db.query(
        `UPDATE autotask_ci_sync_types SET is_synced = $2, updated_at = NOW() WHERE tenant_id = $1`,
        [req.tenant.id, is_synced]
      )
    } else if (ids?.length) {
      await db.query(
        `UPDATE autotask_ci_sync_types SET is_synced = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::int[])`,
        [req.tenant.id, ids, is_synced]
      )
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk update' })
  }
})

// ─── GET /api/settings/asset-types ───────────────────────────────────────────
router.get('/asset-types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT at.*, count(a.id) as asset_count
       FROM asset_types at
       LEFT JOIN assets a ON a.asset_type_id = at.id AND a.tenant_id = at.tenant_id AND a.is_active = true
       WHERE at.tenant_id = $1
       GROUP BY at.id
       ORDER BY at.sort_order NULLS LAST, at.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset types' })
  }
})

// ─── POST /api/settings/asset-types ──────────────────────────────────────────
router.post('/asset-types', async (req, res) => {
  const { name, category, default_lifecycle_years } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const result = await db.query(
      `INSERT INTO asset_types (tenant_id, name, category, default_lifecycle_years)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, name.trim(), category || 'other', default_lifecycle_years || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Asset type already exists' })
    res.status(500).json({ error: 'Failed to create asset type' })
  }
})

// ─── PATCH /api/settings/asset-types/:id ────────────────────────────────────
router.patch('/asset-types/:id', async (req, res) => {
  const { name, category, default_lifecycle_years, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE asset_types SET
         name                   = COALESCE($3, name),
         category               = COALESCE($4, category),
         default_lifecycle_years= COALESCE($5, default_lifecycle_years),
         sort_order             = COALESCE($6, sort_order),
         updated_at             = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name || null, category || null, default_lifecycle_years || null, sort_order ?? null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update asset type' })
  }
})

// ─── DELETE /api/settings/asset-types/:id ───────────────────────────────────
router.delete('/asset-types/:id', async (req, res) => {
  try {
    // Check if in use
    const inUse = await db.query('SELECT count(*) FROM assets WHERE asset_type_id = $1', [req.params.id])
    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(409).json({ error: `Cannot delete — ${inUse.rows[0].count} assets use this type` })
    }
    await db.query('DELETE FROM asset_types WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete asset type' })
  }
})

// ─── GET /api/settings/rules ─────────────────────────────────────────────────
// Fetch tenant-level asset lifecycle rules (inactive threshold, action)
router.get('/rules', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT rmm_inactive_threshold_days, rmm_inactive_action
       FROM tenant_settings WHERE tenant_id = $1`,
      [req.tenant.id]
    )
    // Return defaults if no row yet
    res.json({
      data: result.rows[0] || { rmm_inactive_threshold_days: 60, rmm_inactive_action: 'mark_inactive' },
    })
  } catch (err) {
    console.error('[settings] rules get error:', err.message)
    res.status(500).json({ error: 'Failed to fetch rules' })
  }
})

// ─── PATCH /api/settings/rules ────────────────────────────────────────────────
router.patch('/rules', async (req, res) => {
  const { rmm_inactive_threshold_days, rmm_inactive_action } = req.body
  const days = parseInt(rmm_inactive_threshold_days, 10)
  if (isNaN(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'Threshold must be between 1 and 365 days' })
  }
  const action = rmm_inactive_action || 'mark_inactive'
  if (!['mark_inactive', 'none'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' })
  }
  try {
    const result = await db.query(
      `INSERT INTO tenant_settings (tenant_id, rmm_inactive_threshold_days, rmm_inactive_action, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         rmm_inactive_threshold_days = EXCLUDED.rmm_inactive_threshold_days,
         rmm_inactive_action         = EXCLUDED.rmm_inactive_action,
         updated_at                  = NOW()
       RETURNING rmm_inactive_threshold_days, rmm_inactive_action`,
      [req.tenant.id, days, action]
    )
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[settings] rules patch error:', err.message)
    res.status(500).json({ error: 'Failed to update rules' })
  }
})

// ─── GET /api/settings/lifecycle ─────────────────────────────────────────────
router.get('/lifecycle', async (req, res) => {
  try {
    const config = await getLifecycleConfig(req.tenant.id)
    res.json({ data: config })
  } catch (err) {
    console.error('[settings] lifecycle get error:', err.message)
    res.status(500).json({ error: 'Failed to fetch lifecycle config' })
  }
})

// ─── PATCH /api/settings/lifecycle ───────────────────────────────────────────
router.patch('/lifecycle', async (req, res) => {
  try {
    const config = await saveLifecycleConfig(req.tenant.id, req.body)
    res.json({ data: config })
  } catch (err) {
    console.error('[settings] lifecycle patch error:', err.message)
    res.status(500).json({ error: 'Failed to save lifecycle config' })
  }
})

// ─── POST /api/settings/lifecycle/run ────────────────────────────────────────
router.post('/lifecycle/run', async (req, res) => {
  try {
    const stats = await runLifecycleCheck(req.tenant.id)
    res.json({ data: stats })
  } catch (err) {
    console.error('[settings] lifecycle run error:', err.message)
    res.status(500).json({ error: 'Failed to run lifecycle check' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/settings/client-mapping ────────────────────────────────────────
// All clients with their external system mappings and parent relationships
router.get('/client-mapping', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         c.id, c.name, c.classification, c.account_type,
         c.parent_client_id, c.is_active, c.autotask_company_id, c.sync_enabled,
         p.name AS parent_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id',            cem.id,
               'source_type',   cem.source_type,
               'external_id',   cem.external_id,
               'external_name', cem.external_name,
               'is_confirmed',  cem.is_confirmed,
               'confidence',    cem.confidence
             ) ORDER BY cem.source_type
           ) FILTER (WHERE cem.id IS NOT NULL),
           '[]'
         ) AS external_mappings
       FROM clients c
       LEFT JOIN clients p ON p.id = c.parent_client_id AND p.tenant_id = c.tenant_id
       LEFT JOIN client_external_mappings cem
              ON cem.client_id = c.id AND cem.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.is_active = true
       GROUP BY c.id, p.name
       ORDER BY c.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[settings] client-mapping get error:', err.message)
    res.status(500).json({ error: 'Failed to fetch client mappings' })
  }
})

// ─── PATCH /api/settings/client-mapping/:clientId ────────────────────────────
// Update classification, account_type, and/or parent_client_id
router.patch('/client-mapping/:clientId', async (req, res) => {
  const sets = []
  const params = [req.params.clientId, req.tenant.id]

  if (req.body.classification !== undefined) {
    params.push(req.body.classification || null)
    sets.push(`classification = $${params.length}`)
  }
  if (req.body.account_type !== undefined) {
    params.push(req.body.account_type || null)
    sets.push(`account_type = $${params.length}`)
  }
  if ('parent_client_id' in req.body) {
    params.push(req.body.parent_client_id || null)
    sets.push(`parent_client_id = $${params.length}`)
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  sets.push('updated_at = NOW()')

  try {
    const result = await db.query(
      `UPDATE clients SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, classification, account_type, parent_client_id`,
      params
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[settings] client-mapping patch error:', err.message)
    res.status(500).json({ error: 'Failed to update client' })
  }
})

// ─── POST /api/settings/client-mapping/link ──────────────────────────────────
// Create or update an external system mapping for a client
router.post('/client-mapping/link', async (req, res) => {
  const { client_id, source_type, external_name, external_id } = req.body
  if (!client_id || !source_type || !external_name) {
    return res.status(400).json({ error: 'client_id, source_type, and external_name are required' })
  }
  try {
    const result = await db.query(
      `INSERT INTO client_external_mappings
         (tenant_id, client_id, source_type, external_id, external_name, is_confirmed, confidence)
       VALUES ($1, $2, $3, $4, $5, true, 99)
       ON CONFLICT (tenant_id, source_type, external_name)
       DO UPDATE SET
         client_id    = EXCLUDED.client_id,
         external_id  = COALESCE(EXCLUDED.external_id, client_external_mappings.external_id),
         is_confirmed = true,
         confidence   = 99,
         updated_at   = NOW()
       RETURNING *`,
      [req.tenant.id, client_id, source_type, external_id || null, external_name]
    )
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[settings] client-mapping link error:', err.message)
    res.status(500).json({ error: 'Failed to save mapping' })
  }
})

// ─── PATCH /api/settings/client-mapping/link/:id/confirm ─────────────────────
// Confirm an auto-detected mapping
router.patch('/client-mapping/link/:id/confirm', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE client_external_mappings
       SET is_confirmed = true, confidence = 99, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Mapping not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm mapping' })
  }
})

// ─── DELETE /api/settings/client-mapping/link/:id ────────────────────────────
router.delete('/client-mapping/link/:id', async (req, res) => {
  try {
    await db.query(
      `DELETE FROM client_external_mappings WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mapping' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOTASK COMPANY SYNC FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/settings/autotask-company-filters ───────────────────────────────
// Returns all picklist values for companyType / classification / marketSegmentID
// with their current is_synced state.  Populates the DB from Autotask on first call.
router.get('/autotask-company-filters', async (req, res) => {
  const FIELDS = ['companyType', 'classification', 'marketSegmentID']
  try {
    // Fetch live picklist values from Autotask
    const atClient = buildAtClient()
    const picklists = await getCompanyPicklists(atClient)

    // Upsert all known picklist values into the filters table (preserving is_synced)
    for (const fieldName of FIELDS) {
      const values = picklists[fieldName] || []
      for (const { value, label } of values) {
        await db.query(
          `INSERT INTO autotask_company_type_filters
             (tenant_id, field_name, picklist_value, picklist_label, is_synced)
           VALUES ($1,$2,$3,$4,false)
           ON CONFLICT (tenant_id, field_name, picklist_value)
           DO UPDATE SET picklist_label = EXCLUDED.picklist_label, updated_at = NOW()`,
          [req.tenant.id, fieldName, value, label]
        )
      }
    }

    // Read back with current is_synced state
    const result = await db.query(
      `SELECT field_name, picklist_value, picklist_label, is_synced
       FROM autotask_company_type_filters
       WHERE tenant_id = $1
       ORDER BY field_name, picklist_label`,
      [req.tenant.id]
    )

    // Group by field_name
    const grouped = {}
    for (const row of result.rows) {
      if (!grouped[row.field_name]) grouped[row.field_name] = []
      grouped[row.field_name].push({
        value:     row.picklist_value,
        label:     row.picklist_label,
        is_synced: row.is_synced,
      })
    }

    res.json({ data: grouped })
  } catch (err) {
    console.error('[settings] autotask-company-filters error:', err.message)
    res.status(500).json({ error: 'Failed to fetch Autotask company filters' })
  }
})

// ─── PATCH /api/settings/autotask-company-filters ────────────────────────────
// Body: { updates: [{ field_name, picklist_value, is_synced }] }
// Or single: { field_name, picklist_value, is_synced }
router.patch('/autotask-company-filters', async (req, res) => {
  const updates = req.body.updates || [req.body]
  try {
    for (const { field_name, picklist_value, is_synced } of updates) {
      if (!field_name || picklist_value == null || is_synced == null) continue
      await db.query(
        `UPDATE autotask_company_type_filters
         SET is_synced = $4, updated_at = NOW()
         WHERE tenant_id = $1 AND field_name = $2 AND picklist_value = $3`,
        [req.tenant.id, field_name, picklist_value, is_synced]
      )
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[settings] autotask-company-filters patch error:', err.message)
    res.status(500).json({ error: 'Failed to update filters' })
  }
})

// ─── GET /api/settings/client-mapping/external-companies ─────────────────────
// ?source=pax8|saas_alerts|auvik|it_glue|datto_rmm
// Returns [{id, name}] from that external system (for searchable dropdowns)
router.get('/client-mapping/external-companies', async (req, res) => {
  const { source } = req.query
  const fetchers = {
    pax8:        fetchPax8Companies,
    saas_alerts: fetchSaasAlertsCustomers,
    auvik:       fetchAuvikTenants,
    it_glue:     fetchItGlueOrgs,
    datto_rmm:   fetchDattoRmmSites,
  }
  if (!fetchers[source]) return res.status(400).json({ error: `Unknown source: ${source}` })
  try {
    const companies = await fetchers[source]()
    res.json({ data: companies })
  } catch (err) {
    console.error(`[settings] external-companies ${source} error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/settings/client-mapping/auto-map ───────────────────────────────
// Body: { source?: 'pax8'|'saas_alerts'|... }  (omit to run all sources)
// Fetches companies from external system(s) and auto-matches to clients by name.
// Never overwrites confirmed mappings.
router.post('/client-mapping/auto-map', async (req, res) => {
  const ALL_SOURCES = ['pax8', 'saas_alerts', 'auvik', 'it_glue', 'datto_rmm']
  const sources = req.body.source ? [req.body.source] : ALL_SOURCES

  // Load all clients once
  const clientsRes = await db.query(
    `SELECT id, name FROM clients WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
    [req.tenant.id]
  )
  const clients = clientsRes.rows

  const fetchers = {
    pax8:        fetchPax8Companies,
    saas_alerts: fetchSaasAlertsCustomers,
    auvik:       fetchAuvikTenants,
    it_glue:     fetchItGlueOrgs,
    datto_rmm:   fetchDattoRmmSites,
  }

  const stats = {}
  for (const src of sources) {
    try {
      const companies = await fetchers[src]()
      let matched = 0, skipped = 0

      for (const co of companies) {
        let bestClient = null, bestConf = 0
        for (const cl of clients) {
          const conf = matchConfidence(co.name, cl.name)
          if (conf > bestConf) { bestConf = conf; bestClient = cl }
        }

        if (bestClient && bestConf >= 70) {
          await db.query(
            `INSERT INTO client_external_mappings
               (tenant_id, client_id, source_type, external_id, external_name, is_confirmed, confidence)
             VALUES ($1,$2,$3,$4,$5,false,$6)
             ON CONFLICT (tenant_id, source_type, external_name)
             DO UPDATE SET
               client_id  = EXCLUDED.client_id,
               external_id= COALESCE(EXCLUDED.external_id, client_external_mappings.external_id),
               confidence = EXCLUDED.confidence,
               updated_at = NOW()
             WHERE NOT client_external_mappings.is_confirmed`,
            [req.tenant.id, bestClient.id, src, co.id || null, co.name, Math.min(bestConf, 99)]
          )
          matched++
        } else {
          skipped++
        }
      }
      stats[src] = { total: companies.length, matched, skipped }
    } catch (err) {
      console.error(`[settings] auto-map ${src} error:`, err.message)
      stats[src] = { error: err.message }
    }
  }
  res.json({ data: stats })
})

// ─── GET /api/settings/client-mapping/pax8-companies ─────────────────────────
// Returns all PAX8 active company names for the mapping dropdown
router.get('/client-mapping/pax8-companies', async (req, res) => {
  try {
    const companies = await fetchPax8Companies()
    res.json({ data: companies })
  } catch (err) {
    console.error('[settings] pax8-companies error:', err.message)
    res.status(500).json({ error: 'Failed to fetch PAX8 companies' })
  }
})

// ─── Verticals CRUD ──────────────────────────────────────────────────────────

router.get('/verticals', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM tenant_verticals WHERE tenant_id = $1 ORDER BY sort_order, name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[settings] verticals list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch verticals' })
  }
})

router.post('/verticals', async (req, res) => {
  const { name, autotask_classification } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  try {
    const result = await db.query(
      `INSERT INTO tenant_verticals (tenant_id, name, slug, autotask_classification, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order),0)+1 FROM tenant_verticals WHERE tenant_id = $1))
       ON CONFLICT (tenant_id, slug) DO NOTHING
       RETURNING *`,
      [req.tenant.id, name.trim(), slug, autotask_classification || null]
    )
    if (!result.rows.length) return res.status(409).json({ error: 'Vertical already exists' })
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[settings] create vertical error:', err.message)
    res.status(500).json({ error: 'Failed to create vertical' })
  }
})

router.patch('/verticals/:id', async (req, res) => {
  const { name, autotask_classification, is_active, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE tenant_verticals SET
        name = COALESCE($3, name),
        autotask_classification = COALESCE($4, autotask_classification),
        is_active = COALESCE($5, is_active),
        sort_order = COALESCE($6, sort_order)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, autotask_classification, is_active, sort_order]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vertical' })
  }
})

router.delete('/verticals/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM tenant_verticals WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete vertical' })
  }
})

// ─── LOB Apps CRUD ───────────────────────────────────────────────────────────

router.get('/lob-apps', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM tenant_lob_apps WHERE tenant_id = $1 ORDER BY category, name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[settings] lob-apps list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch LOB apps' })
  }
})

router.post('/lob-apps', async (req, res) => {
  const { name, vendor, category, client_id } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    // Add to tenant master list
    const result = await db.query(
      `INSERT INTO tenant_lob_apps (tenant_id, name, vendor, category)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, name) DO NOTHING
       RETURNING *`,
      [req.tenant.id, name.trim(), vendor || null, category || 'general']
    )

    // If client_id provided, also assign to that client's lob_apps array
    if (client_id) {
      await db.query(
        `UPDATE clients
         SET lob_apps = array_append(
           COALESCE(lob_apps, ARRAY[]::text[]),
           $2
         )
         WHERE id = $1 AND tenant_id = $3
           AND NOT ($2 = ANY(COALESCE(lob_apps, ARRAY[]::text[])))`,
        [client_id, name.trim(), req.tenant.id]
      )
    }

    res.status(201).json({ data: result.rows[0] || { name: name.trim() }, already_existed: result.rows.length === 0 })
  } catch (err) {
    console.error('[settings] create lob-app error:', err.message)
    res.status(500).json({ error: 'Failed to create LOB app' })
  }
})

router.delete('/lob-apps/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM tenant_lob_apps WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete LOB app' })
  }
})

// POST /api/settings/lob-apps/sync-from-software — pull distinct software names into LOB list
router.post('/lob-apps/sync-from-software', async (req, res) => {
  try {
    const result = await db.query(`
      INSERT INTO tenant_lob_apps (tenant_id, name, vendor, category)
      SELECT DISTINCT $1, si.name, si.publisher, COALESCE(si.category, 'general')
      FROM software_inventory si
      WHERE si.tenant_id = $1 AND si.name IS NOT NULL AND si.name != ''
        AND NOT EXISTS (SELECT 1 FROM tenant_lob_apps t WHERE t.tenant_id = $1 AND t.name = si.name)
      ON CONFLICT (tenant_id, name) DO NOTHING
    `, [req.tenant.id])
    res.json({ status: 'ok', imported: result.rowCount })
  } catch (err) {
    console.error('[settings] sync lob-apps from software error:', err.message)
    res.status(500).json({ error: 'Failed to sync from software' })
  }
})

// POST /api/settings/lob-apps/sync-from-autotask — pull "Software - Line of Business" CIs from Autotask
router.post('/lob-apps/sync-from-autotask', async (req, res) => {
  try {
    const axios = require('axios')
    const zone = process.env.AUTOTASK_ZONE || 'webservices1'
    const baseURL = `https://${zone}.autotask.net/ATServicesRest/V1.0`
    const atClient = axios.create({
      baseURL,
      headers: {
        ApiIntegrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
        UserName:           process.env.AUTOTASK_API_USER,
        Secret:             process.env.AUTOTASK_API_SECRET,
        'Content-Type':     'application/json',
      },
    })

    // CI type 15 = "SOFTWARE - LINE OF BUSINESS"
    const LOB_CI_TYPE = 15
    let allCIs = []
    let nextPage = null
    let page = 0

    do {
      const body = {
        filter: [
          { field: 'configurationItemType', op: 'eq', value: LOB_CI_TYPE },
          { field: 'isActive', op: 'eq', value: true },
        ],
        maxRecords: 500,
      }
      const url = nextPage || '/ConfigurationItems/query'
      const r = await atClient.post(url, body)
      const items = r.data?.items || []
      allCIs = allCIs.concat(items)
      nextPage = r.data?.pageDetails?.nextPageUrl || null
      page++
    } while (nextPage && page < 20)

    console.log(`[lob-sync] Fetched ${allCIs.length} LOB CIs from Autotask`)

    // Build client mapping: autotask_company_id → client id
    const clientsResult = await db.query(
      `SELECT id, autotask_company_id FROM clients WHERE tenant_id = $1 AND autotask_company_id IS NOT NULL`,
      [req.tenant.id]
    )
    const clientMap = {}
    for (const c of clientsResult.rows) clientMap[c.autotask_company_id] = c.id

    let addedToMaster = 0
    let assignedToClients = 0

    for (const ci of allCIs) {
      const name = (ci.referenceTitle || ci.referenceNumber || '').trim()
      if (!name) continue

      // Add to master LOB list
      const ins = await db.query(
        `INSERT INTO tenant_lob_apps (tenant_id, name, vendor, category)
         VALUES ($1, $2, $3, 'lob')
         ON CONFLICT (tenant_id, name) DO NOTHING
         RETURNING id`,
        [req.tenant.id, name, null]
      )
      if (ins.rows.length > 0) addedToMaster++

      // Assign to client
      const clientId = clientMap[ci.companyID]
      if (clientId) {
        await db.query(
          `UPDATE clients
           SET lob_apps = array_append(
             COALESCE(lob_apps, ARRAY[]::text[]),
             $2
           )
           WHERE id = $1 AND NOT ($2 = ANY(COALESCE(lob_apps, ARRAY[]::text[])))`,
          [clientId, name]
        )
        assignedToClients++
      }
    }

    console.log(`[lob-sync] Added ${addedToMaster} new LOB apps, assigned ${assignedToClients} to clients`)
    res.json({ status: 'ok', fetched: allCIs.length, added_to_master: addedToMaster, assigned_to_clients: assignedToClients })
  } catch (err) {
    console.error('[settings] sync lob-apps from autotask error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to sync from Autotask' })
  }
})

module.exports = router
