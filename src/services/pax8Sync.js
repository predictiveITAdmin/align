/**
 * PAX8 Sync Service
 *
 * Pulls company subscriptions from PAX8 (cloud distributor) and upserts
 * into saas_subscriptions table. Maps PAX8 companies to Align clients by name.
 *
 * Env vars required: PAX8_CLIENT_ID, PAX8_CLIENT_SECRET
 */

const axios = require('axios')
const db = require('../db')

const PAX8_BASE = 'https://api.pax8.com/v1'
const TOKEN_URL = 'https://login.pax8.com/oauth/token'

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken() {
  const res = await axios.post(TOKEN_URL, {
    client_id:     process.env.PAX8_CLIENT_ID,
    client_secret: process.env.PAX8_CLIENT_SECRET,
    audience:      'https://api.pax8.com',
    grant_type:    'client_credentials',
  }, { headers: { 'Content-Type': 'application/json' } })
  return res.data.access_token
}

// ─── PAX8 API helpers ─────────────────────────────────────────────────────────

async function fetchAllPages(token, path) {
  const results = []
  let page = 0
  const size = 200
  while (true) {
    const res = await axios.get(`${PAX8_BASE}${path}${path.includes('?') ? '&' : '?'}size=${size}&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const items = res.data.content || []
    results.push(...items)
    const pageInfo = res.data.page || {}
    const totalPages = pageInfo.totalPages ?? Math.ceil((pageInfo.totalElements || items.length) / size)
    if (items.length < size || page + 1 >= totalPages) break
    page++
  }
  return results
}

// ─── Product cache ────────────────────────────────────────────────────────────

const productCache = {}

async function getProductName(token, productId) {
  if (productCache[productId]) return productCache[productId]
  try {
    const res = await axios.get(`${PAX8_BASE}/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const name = res.data.name || productId
    productCache[productId] = { name, vendorName: res.data.vendorName || '' }
    return productCache[productId]
  } catch {
    productCache[productId] = { name: productId, vendorName: '' }
    return productCache[productId]
  }
}

// ─── Client matching ──────────────────────────────────────────────────────────

function normalise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchClient(pax8Name, alignClients) {
  const normName = normalise(pax8Name)
  // 1. Exact match
  let match = alignClients.find(c => normalise(c.name) === normName)
  if (match) return match
  // 2. Contains match
  match = alignClients.find(c => {
    const cn = normalise(c.name)
    return cn.includes(normName) || normName.includes(cn)
  })
  return match || null
}

// ─── Main sync ────────────────────────────────────────────────────────────────

async function syncPax8(tenantId) {
  if (!process.env.PAX8_CLIENT_ID || !process.env.PAX8_CLIENT_SECRET) {
    throw new Error('PAX8 credentials not configured')
  }

  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'pax8', 'PAX8', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )

  const token = await getToken()
  console.log('[pax8Sync] Token OK')

  // Load align clients
  const clientsResult = await db.query(
    `SELECT id, name FROM clients WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  )
  const alignClients = clientsResult.rows

  // Fetch all PAX8 companies
  const companies = await fetchAllPages(token, '/companies?status=Active')
  console.log(`[pax8Sync] ${companies.length} PAX8 companies`)

  // Build PAX8 company ID → align client map
  const companyMap = {}
  let unmatched = []
  for (const co of companies) {
    const normName = normalise(co.name)
    const exactMatch = alignClients.find(c => normalise(c.name) === normName)
    const alignClient = exactMatch || matchClient(co.name, alignClients)
    if (alignClient) {
      const confidence = exactMatch ? 99 : 70
      companyMap[co.id] = { alignClientId: alignClient.id, name: co.name }
      // Write to client_external_mappings so the mapping UI can show/manage these
      try {
        await db.query(
          `INSERT INTO client_external_mappings
             (tenant_id, client_id, source_type, external_id, external_name, is_confirmed, confidence)
           VALUES ($1,$2,'pax8',$3,$4,false,$5)
           ON CONFLICT (tenant_id, source_type, external_name)
           DO UPDATE SET
             client_id   = EXCLUDED.client_id,
             external_id = COALESCE(EXCLUDED.external_id, client_external_mappings.external_id),
             confidence  = EXCLUDED.confidence,
             updated_at  = now()`,
          [tenantId, alignClient.id, co.id, co.name, confidence]
        )
      } catch (mapErr) {
        console.error(`[pax8Sync] Mapping write error for ${co.name}: ${mapErr.message}`)
      }
    } else {
      unmatched.push(co.name)
    }
  }
  console.log(`[pax8Sync] Matched ${Object.keys(companyMap).length}/${companies.length} companies`)
  if (unmatched.length) console.log(`[pax8Sync] Unmatched: ${unmatched.join(', ')}`)

  // Fetch all active subscriptions
  const subscriptions = await fetchAllPages(token, '/subscriptions?status=Active')
  console.log(`[pax8Sync] ${subscriptions.length} active subscriptions`)

  const stats = { companies: companies.length, matched: Object.keys(companyMap).length, upserted: 0, skipped: 0, errors: 0 }

  for (const sub of subscriptions) {
    const mapped = companyMap[sub.companyId]
    if (!mapped) { stats.skipped++; continue }

    // Look up product name from PAX8 products API
    const product = await getProductName(token, sub.productId)
    const licenseName = product.name
    const platform = resolvePlatform(product.vendorName, licenseName)
    const costPerSeat = sub.quantity > 0 ? parseFloat(sub.price || 0) / sub.quantity : 0
    const partnerCostPerSeat = sub.quantity > 0 ? parseFloat(sub.partnerCost || 0) / sub.quantity : 0

    try {
      await db.query(
        `INSERT INTO saas_subscriptions
           (tenant_id, client_id, platform, license_name, license_sku, total_seats,
            cost_per_seat, subscription_start, subscription_end, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, client_id, platform, license_name)
         DO UPDATE SET
           total_seats       = EXCLUDED.total_seats,
           cost_per_seat     = EXCLUDED.cost_per_seat,
           subscription_start= EXCLUDED.subscription_start,
           subscription_end  = EXCLUDED.subscription_end,
           notes             = EXCLUDED.notes,
           updated_at        = now()`,
        [
          tenantId,
          mapped.alignClientId,
          platform,
          licenseName,
          sub.productId || null,
          sub.quantity || 0,
          costPerSeat,
          sub.startDate ? sub.startDate.split('T')[0] : null,
          sub.commitment?.endDate ? sub.commitment.endDate.split('T')[0] : null,
          `PAX8 | ${product.vendorName || ''} | partner cost: $${partnerCostPerSeat.toFixed(2)}/seat | billing: ${sub.billingTerm || ''}`,
        ]
      )
      stats.upserted++
    } catch (err) {
      console.error(`[pax8Sync] Upsert error for ${mapped.name} / ${licenseName}: ${err.message}`)
      stats.errors++
    }
  }

  await db.query(
    `UPDATE sync_sources SET last_sync_at = now() WHERE tenant_id = $1 AND source_type = 'pax8'`,
    [tenantId]
  )

  console.log(`[pax8Sync] Done:`, stats)
  return stats
}

function resolvePlatform(vendorName, productName) {
  const v = (vendorName || '').toLowerCase()
  const p = (productName || '').toLowerCase()
  if (v.includes('microsoft') || p.includes('microsoft') || p.includes('office') || p.includes('azure') || p.includes('365')) return 'microsoft365'
  if (v.includes('google') || p.includes('google') || p.includes('workspace')) return 'google'
  if (v.includes('adobe')) return 'adobe'
  if (v.includes('dropbox')) return 'dropbox'
  if (v.includes('slack')) return 'slack'
  return vendorName?.toLowerCase().replace(/\s+/g, '_') || 'other'
}

// ─── Exported helper for settings API ─────────────────────────────────────────

async function fetchPax8Companies() {
  if (!process.env.PAX8_CLIENT_ID || !process.env.PAX8_CLIENT_SECRET) return []
  const token = await getToken()
  const companies = await fetchAllPages(token, '/companies?status=Active')
  return companies.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))
}

module.exports = { syncPax8, fetchPax8Companies }
