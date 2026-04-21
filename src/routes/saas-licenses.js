const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// Common M365 SKU ID → friendly name mapping
const M365_SKU_NAMES = {
  'f245ecc8-75af-4f8e-b61f-27d8114de5f3': 'Microsoft 365 Business Premium',
  '4b9405b0-7788-4568-add1-99614e613b69': 'Microsoft 365 Business Basic',
  'cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46': 'Microsoft 365 Business Standard',
  'f30db892-07e9-47e9-837c-80727f46fd3d': 'Microsoft 365 Apps for Business',
  '6fd2c87f-b296-42f0-b197-1e91e994b900': 'Microsoft 365 E1',
  'c2273bd0-dff7-4215-9ef5-2c7bcfb06425': 'Microsoft 365 E3',
  '05e9a617-0261-4cee-bb44-138d3ef5d965': 'Microsoft 365 E3',
  '06ebc4ee-1bb5-47dd-8120-11324bc54e06': 'Microsoft 365 E5',
  '3b555118-da6a-4418-894f-7df1e2096870': 'EMS E3',
  'efccb6f7-5641-4e0e-bd10-b4976e1bf68e': 'EMS E3',
  'b05e124f-c7cc-45a0-a6aa-8cf78c946968': 'EMS E5',
  'a0e6a48f-b056-4037-af70-b9ac53504551': 'Exchange Online (Plan 1)',
  '19ec0d23-8335-4cbd-94ac-6050e30712fa': 'Exchange Online (Plan 2)',
  '4ef96642-f096-40de-a3e9-d83fb2f90211': 'Azure AD Premium P1',
  '84a661c4-e949-4bd2-a560-ed7766fcaf2b': 'Azure AD Premium P2',
  '00e1ec7b-e4a3-40d1-9441-b69b597ab222': 'Azure Information Protection P1',
  'c52ea49f-fe5d-4e95-93ba-1de91d380f89': 'SharePoint Online (Plan 1)',
  '5dbe027f-2339-4123-9542-606e4d348a72': 'SharePoint Online (Plan 2)',
  'e9b5658e-6fe5-4bf0-b2f5-827d7e14d1ab': 'Microsoft Teams (Free)',
  '6070a4c8-34c6-4937-8dfb-39bbc6397a60': 'Microsoft Teams Essentials',
  '4cde982a-ede4-4409-9ae6-b003453c8ea6': 'Teams Phone Standard',
  '440eaaa8-b3e0-484b-a8be-62870b9ba70a': 'Phone System',
  '061f9ace-7d42-4136-88ac-31dc755f143f': 'Intune',
  '7e74bd05-2c6a-4101-bc7a-d2eda85c6bc9': 'Microsoft Defender for Business',
  '76897c14-b89b-4e75-91fb-37a8fd9fbc62': 'Microsoft Defender for Office 365 P1',
  '3f58dca2-50b2-4a7c-a38f-06f1db4e8eb0': 'Microsoft Defender for Office 365 P2',
  'b17653a4-2443-4e8c-a550-18249dda78bb': 'Microsoft 365 A1',
  '94763226-9b3c-4e75-a931-5c89701abe66': 'Microsoft 365 A3',
  '639dec6b-bb19-468b-871c-c5c441c4b0cb': 'Microsoft 365 Lighthouse',
  '1f2f344a-700d-42c9-9427-5cea1d5d7ba6': 'Intune Device',
  'ba774810-2bab-4f62-8ffc-61a44c3e63da': 'Windows 365 Business 2 vCPU',
  '9a4c8a8b-c5a2-4e22-93de-95a0e5bbce38': 'Windows 365 Business 4 vCPU',
}

function resolveLicenseName(raw) {
  if (!raw) return 'Unknown License'
  return M365_SKU_NAMES[raw.toLowerCase()] || raw
}

// ─── GET /api/saas-licenses — list per-user licenses ─────────────────────────
router.get('/', async (req, res) => {
  const { client_id, platform, search } = req.query
  try {
    let query = `
      SELECT sl.*, c.name as client_name
      FROM saas_licenses sl
      JOIN clients c ON c.id = sl.client_id
      WHERE sl.tenant_id = $1 AND sl.is_active = true`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND sl.client_id = $${params.length}` }
    if (platform)  { params.push(platform);  query += ` AND sl.platform = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      query += ` AND (sl.user_email ILIKE $${params.length} OR sl.user_display_name ILIKE $${params.length} OR sl.license_name ILIKE $${params.length})`
    }
    query += ` ORDER BY sl.user_display_name, sl.user_email`
    const result = await db.query(query, params)
    const rows = result.rows.map(r => ({
      ...r,
      license_display_name: resolveLicenseName(r.license_name),
    }))
    res.json({ data: rows })
  } catch (err) {
    console.error('[saas-licenses] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch licenses' })
  }
})

// ─── GET /api/saas-licenses/global-summary — all clients, all SKUs ───────────
// Returns: client | product | status | active | consumed | available | suspended | mfa_issues
router.get('/global-summary', async (req, res) => {
  const { platform, search, client_id } = req.query
  try {
    let query = `
      SELECT
        c.id                                                        AS client_id,
        c.name                                                      AS client_name,
        sl.platform,
        sl.license_name,
        COALESCE(sub.total_seats, 0)                                AS total_seats,
        COALESCE(sub.cost_per_seat, MAX(sl.monthly_cost), 0)        AS cost_per_seat,
        sub.subscription_end,
        COUNT(*)                                                    AS consumed,
        COUNT(*) FILTER (WHERE sl.account_status = 'active' OR sl.account_status IS NULL) AS active,
        COUNT(*) FILTER (WHERE sl.account_status = 'suspended')    AS suspended,
        GREATEST(0, COALESCE(sub.total_seats,0) - COUNT(*)::int)   AS available,
        COUNT(*) FILTER (WHERE sl.mfa_enabled = false)             AS mfa_disabled_count,
        MAX(sub.id::text)                                           AS subscription_id
      FROM saas_licenses sl
      JOIN clients c ON c.id = sl.client_id
      LEFT JOIN saas_subscriptions sub
        ON sub.tenant_id = sl.tenant_id
        AND sub.client_id = sl.client_id
        AND sub.platform = sl.platform
        AND sub.license_name = sl.license_name
      WHERE sl.tenant_id = $1 AND sl.is_active = true`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND sl.client_id = $${params.length}` }
    if (platform)  { params.push(platform);  query += ` AND sl.platform = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      query += ` AND (c.name ILIKE $${params.length} OR sl.license_name ILIKE $${params.length})`
    }
    query += ` GROUP BY c.id, c.name, sl.platform, sl.license_name, sub.total_seats, sub.cost_per_seat, sub.subscription_end
               ORDER BY c.name, sl.platform, sl.license_name`
    const result = await db.query(query, params)
    const rows = result.rows.map(r => ({
      ...r,
      license_display_name: resolveLicenseName(r.license_name),
      status: r.suspended > 0 ? 'suspended' : r.available === 0 && r.total_seats > 0 ? 'full' : 'enabled',
      monthly_total: parseFloat(r.cost_per_seat || 0) * parseInt(r.consumed || 0),
    }))
    res.json({ data: rows })
  } catch (err) {
    console.error('[saas-licenses] global-summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch global summary' })
  }
})

// ─── GET /api/saas-licenses/summary — per-client SKU summary (legacy + enhanced) ─
router.get('/summary', async (req, res) => {
  const { client_id } = req.query
  try {
    let query = `
      SELECT
        sl.platform,
        sl.license_name,
        COALESCE(sub.total_seats, 0)                                AS total_seats,
        COALESCE(sub.cost_per_seat, MAX(sl.monthly_cost), 0)        AS cost_per_seat,
        sub.subscription_end,
        sub.id                                                      AS subscription_id,
        COUNT(*)                                                    AS consumed,
        COUNT(*) FILTER (WHERE sl.account_status = 'active' OR sl.account_status IS NULL) AS active,
        COUNT(*) FILTER (WHERE sl.account_status = 'suspended')    AS suspended,
        GREATEST(0, COALESCE(sub.total_seats,0) - COUNT(*)::int)   AS available,
        COUNT(*) FILTER (WHERE sl.mfa_enabled = false)             AS mfa_disabled_count
      FROM saas_licenses sl
      LEFT JOIN saas_subscriptions sub
        ON sub.tenant_id = sl.tenant_id
        AND sub.client_id = sl.client_id
        AND sub.platform = sl.platform
        AND sub.license_name = sl.license_name
      WHERE sl.tenant_id = $1 AND sl.is_active = true`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND sl.client_id = $${params.length}` }
    query += ` GROUP BY sl.platform, sl.license_name, sub.total_seats, sub.cost_per_seat, sub.subscription_end, sub.id
               ORDER BY consumed DESC`
    const result = await db.query(query, params)
    const rows = result.rows.map(r => ({
      ...r,
      license_display_name: resolveLicenseName(r.license_name),
      status: r.suspended > 0 ? 'suspended' : r.available === 0 && r.total_seats > 0 ? 'full' : 'enabled',
      monthly_total: parseFloat(r.cost_per_seat || 0) * parseInt(r.consumed || 0),
    }))
    res.json({ data: rows })
  } catch (err) {
    console.error('[saas-licenses] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch license summary' })
  }
})

// ─── GET /api/saas-licenses/subscriptions — list subscriptions for a client ──
router.get('/subscriptions', requireAuth, async (req, res) => {
  const { client_id } = req.query
  try {
    const params = [req.tenant.id]
    let where = 'WHERE tenant_id = $1'
    if (client_id) { params.push(client_id); where += ` AND client_id = $${params.length}` }
    const result = await db.query(
      `SELECT * FROM saas_subscriptions ${where} ORDER BY platform, license_name`,
      params
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/saas-licenses/subscriptions — create or upsert subscription ───
router.post('/subscriptions', requireAuth, async (req, res) => {
  const { client_id, platform, license_name, license_sku, total_seats, cost_per_seat, subscription_start, subscription_end, notes } = req.body
  try {
    const result = await db.query(
      `INSERT INTO saas_subscriptions
         (tenant_id, client_id, platform, license_name, license_sku, total_seats, cost_per_seat, subscription_start, subscription_end, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, client_id, platform, license_name)
       DO UPDATE SET
         total_seats = EXCLUDED.total_seats,
         cost_per_seat = EXCLUDED.cost_per_seat,
         license_sku = EXCLUDED.license_sku,
         subscription_start = EXCLUDED.subscription_start,
         subscription_end = EXCLUDED.subscription_end,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING *`,
      [req.tenant.id, client_id, platform, license_name, license_sku || null,
       total_seats || 0, cost_per_seat || null, subscription_start || null,
       subscription_end || null, notes || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PATCH /api/saas-licenses/subscriptions/:id ───────────────────────────────
router.patch('/subscriptions/:id', requireAuth, async (req, res) => {
  const fields = ['total_seats','cost_per_seat','subscription_start','subscription_end','notes','license_sku']
  const updates = []
  const params = [req.params.id, req.tenant.id]
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f])
      updates.push(`${f} = $${params.length}`)
    }
  })
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' })
  updates.push(`updated_at = now()`)
  try {
    const result = await db.query(
      `UPDATE saas_subscriptions SET ${updates.join(', ')} WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      params
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/saas-licenses/subscriptions/:id ─────────────────────────────
router.delete('/subscriptions/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM saas_subscriptions WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenant.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
