/**
 * Warranty lookup service — queries manufacturer APIs by serial number
 * Supported: Dell (TechDirect OAuth2 API), HP (public), Lenovo (public)
 */
const axios = require('axios')
const db = require('../db')

// ─── Dell ─────────────────────────────────────────────────────────────────────
// Requires TechDirect API credentials (client_id + client_secret)
// OAuth2 token endpoint: https://apigtwb2c.us.dell.com/auth/oauth/v2/token
// Warranty endpoint: https://apigtwb2c.us.dell.com/PROD/sbil/eapi/submitrequest

async function getDellToken(clientId, clientSecret) {
  const res = await axios.post('https://apigtwb2c.us.dell.com/auth/oauth/v2/token',
    `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  )
  return res.data.access_token
}

async function lookupDell(serial, token) {
  const res = await axios.get(
    `https://apigtwb2c.us.dell.com/PROD/sbil/eapi/submitrequest?idItem=${encodeURIComponent(serial)}&keyId=key&domainType=serialTag&schemaVersion=1.0`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
  )
  const item = res.data?.AssetWarrantyResponse?.[0]
  if (!item) return null
  const hdr = item.AssetHeaderData || {}
  const warranties = item.AssetEntitlementData || []
  // Get latest warranty end date
  let warrantyEnd = null
  let shipDate = hdr.ShipDate || null
  for (const w of warranties) {
    if (w.EndDate && (!warrantyEnd || new Date(w.EndDate) > new Date(warrantyEnd))) {
      warrantyEnd = w.EndDate
    }
  }
  return {
    purchase_date: shipDate ? new Date(shipDate).toISOString().split('T')[0] : null,
    warranty_expiry: warrantyEnd ? new Date(warrantyEnd).toISOString().split('T')[0] : null,
    model: hdr.ProductLineDescription || null,
    source: 'Dell TechDirect',
  }
}

// ─── HP ───────────────────────────────────────────────────────────────────────
// Uses HP's public warranty check API (no key required for basic lookups)

async function lookupHP(serial) {
  try {
    const res = await axios.get(
      `https://support.hp.com/wcc-services/getPDVWarrantyDetails?serialNumber=${encodeURIComponent(serial)}&country=US&language=en`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
    )
    const data = res.data
    if (!data) return null
    const warrantyEnd = data.OverallWarrantyEndDate || data.warrantyEndDate || null
    const startDate = data.OverallWarrantyStartDate || data.warrantyStartDate || null
    return {
      purchase_date: startDate ? new Date(startDate).toISOString().split('T')[0] : null,
      warranty_expiry: warrantyEnd ? new Date(warrantyEnd).toISOString().split('T')[0] : null,
      source: 'HP Support',
    }
  } catch {
    return null
  }
}

// ─── Lenovo ───────────────────────────────────────────────────────────────────
// Uses Lenovo's public warranty API (no key required)

async function lookupLenovo(serial) {
  try {
    const res = await axios.get(
      `https://pcsupport.lenovo.com/us/en/api/v4/mse/products/byMachineId?machineId=${encodeURIComponent(serial)}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
    )
    const product = res.data?.data
    if (!product) return null
    const warranty = product.warrantyInfo
    return {
      purchase_date: product.purchaseDate || null,
      warranty_expiry: warranty?.endDate || null,
      model: product.productName || null,
      source: 'Lenovo Support',
    }
  } catch {
    return null
  }
}

// ─── Cisco ────────────────────────────────────────────────────────────────────
// Uses Cisco Support API (EOX) — requires DevNet OAuth2 credentials
// Register free at: developer.cisco.com → Support APIs
// Token: https://id.cisco.com/oauth2/default/v1/token
// EOX:   https://apix.cisco.com/supporttools/eox/rest/5/EOXBySerialNumber/1/{serial}

async function getCiscoToken(clientId, clientSecret) {
  const res = await axios.post('https://id.cisco.com/oauth2/default/v1/token',
    `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  )
  return res.data.access_token
}

async function lookupCisco(serial, token) {
  const res = await axios.get(
    `https://apix.cisco.com/supporttools/eox/rest/5/EOXBySerialNumber/1/${encodeURIComponent(serial)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: 10000 }
  )
  const eox = res.data?.EOXRecord?.[0]
  if (!eox || eox.EOXError) return null
  // Cisco EOX returns lifecycle dates — LastDateOfSupport is the closest to warranty expiry
  const support = eox.LastDateOfSupport?.value || null
  const eos = eox.EndOfSaleDate?.value || null
  return {
    purchase_date: null, // Cisco EOX doesn't provide ship/purchase date
    warranty_expiry: support ? new Date(support).toISOString().split('T')[0] : null,
    end_of_sale: eos ? new Date(eos).toISOString().split('T')[0] : null,
    model: eox.EOLProductID || null,
    source: 'Cisco EOX API',
  }
}

// ─── Meraki ───────────────────────────────────────────────────────────────────
// Uses Meraki Dashboard API v1 — requires API key from Meraki Dashboard > Profile
// Looks up license expiry date by device serial across all orgs the key can see

async function getMerakiOrgs(apiKey) {
  const res = await axios.get('https://api.meraki.com/api/v1/organizations', {
    headers: { 'X-Cisco-Meraki-API-Key': apiKey, Accept: 'application/json' },
    timeout: 10000,
  })
  return res.data || []
}

async function lookupMeraki(serial, apiKey) {
  const orgs = await getMerakiOrgs(apiKey)
  for (const org of orgs) {
    try {
      const res = await axios.get(
        `https://api.meraki.com/api/v1/organizations/${org.id}/licenses?deviceSerial=${encodeURIComponent(serial)}`,
        { headers: { 'X-Cisco-Meraki-API-Key': apiKey, Accept: 'application/json' }, timeout: 10000 }
      )
      const licenses = res.data || []
      if (!licenses.length) continue
      // Use latest expiration date across all matching licenses
      const best = licenses.reduce((a, b) =>
        new Date(a.expirationDate || 0) > new Date(b.expirationDate || 0) ? a : b
      )
      return {
        purchase_date: best.activationDate
          ? new Date(best.activationDate).toISOString().split('T')[0] : null,
        warranty_expiry: best.expirationDate
          ? new Date(best.expirationDate).toISOString().split('T')[0] : null,
        source: `Meraki Dashboard (${org.name})`,
      }
    } catch { continue }
  }
  return null
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function lookupWarranty(manufacturer, serial, config) {
  const m = (manufacturer || '').toLowerCase()
  if (!serial) return null

  try {
    if (/dell/.test(m)) {
      if (!config.dell?.client_id || !config.dell?.client_secret) return null
      const token = await getDellToken(config.dell.client_id, config.dell.client_secret)
      return await lookupDell(serial, token)
    }
    if (/^hp$|hewlett|hp inc/.test(m)) {
      return await lookupHP(serial)
    }
    if (/lenovo/.test(m)) {
      return await lookupLenovo(serial)
    }
    if (/cisco/.test(m)) {
      if (!config.cisco?.client_id || !config.cisco?.client_secret) return null
      const token = await getCiscoToken(config.cisco.client_id, config.cisco.client_secret)
      return await lookupCisco(serial, token)
    }
    if (/meraki/.test(m)) {
      if (!config.meraki?.api_key) return null
      return await lookupMeraki(serial, config.meraki.api_key)
    }
    if (/\bapc\b|schneider/i.test(m)) {
      // No public API — estimate from APC serial number format:
      // Positions 2-5 encode manufacture year (2 digits) + week (2 digits)
      // e.g. "3S1516X..." = year 2015, week 16
      const match = serial.match(/^.{2}(\d{2})(\d{2})/i)
      if (!match) return null
      const yr = 2000 + parseInt(match[1])
      const wk = parseInt(match[2])
      if (yr < 2000 || yr > 2035 || wk < 1 || wk > 53) return null
      const purchaseDate = new Date(yr, 0, 1 + (wk - 1) * 7)
      const warrantyYears = config.apc?.warranty_years ? parseInt(config.apc.warranty_years) : 2
      const warrantyEnd = new Date(purchaseDate)
      warrantyEnd.setFullYear(warrantyEnd.getFullYear() + warrantyYears)
      return {
        purchase_date: purchaseDate.toISOString().split('T')[0],
        warranty_expiry: warrantyEnd.toISOString().split('T')[0],
        source: `APC Serial Estimate (${warrantyYears}yr warranty)`,
      }
    }
    // Ubiquiti, Apple — no public warranty APIs
  } catch (err) {
    console.error(`[warranty-lookup] ${manufacturer}/${serial}: ${err.message}`)
    return null
  }
  return null
}

// ─── Bulk run for a tenant ─────────────────────────────────────────────────────

async function runWarrantyLookup(tenantId, manufacturerFilter = null) {
  // Load tenant config
  const settingsRow = await db.query(
    `SELECT warranty_lookup_config FROM tenant_settings WHERE tenant_id = $1`,
    [tenantId]
  )
  const config = settingsRow.rows[0]?.warranty_lookup_config || {}

  // Find assets that need lookup — have serial number + matched manufacturer, no/stale warranty date
  let whereManufacturer = ''
  const params = [tenantId]
  if (manufacturerFilter) {
    params.push(`%${manufacturerFilter}%`)
    whereManufacturer = `AND (manufacturer ILIKE $2 OR datto_rmm_data->>'manufacturer' ILIKE $2)`
  }

  const assets = await db.query(`
    SELECT id, serial_number, manufacturer,
           datto_rmm_data->>'manufacturer' AS rmm_manufacturer,
           warranty_expiry, purchase_date
    FROM assets
    WHERE tenant_id = $1
      AND serial_number IS NOT NULL AND serial_number != ''
      AND is_active = true
      ${whereManufacturer}
    ORDER BY manufacturer, id
  `, params)

  const rows = assets.rows
  const stats = { total: rows.length, updated: 0, skipped: 0, errors: 0 }

  for (const asset of rows) {
    const mfr = asset.manufacturer || asset.rmm_manufacturer || ''
    const result = await lookupWarranty(mfr, asset.serial_number, config)

    if (!result) { stats.skipped++; continue }

    // Only update fields if we got real data and it's better than what we have
    const updates = {}
    if (result.warranty_expiry && !asset.warranty_expiry) {
      updates.warranty_expiry = result.warranty_expiry
    }
    if (result.purchase_date && !asset.purchase_date) {
      updates.purchase_date = result.purchase_date
    }
    // Always record which source provided the warranty data
    if (result.source && (updates.warranty_expiry || updates.purchase_date)) {
      updates.warranty_source = result.source
    }

    if (Object.keys(updates).length === 0) { stats.skipped++; continue }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(', ')
    await db.query(
      `UPDATE assets SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [asset.id, tenantId, ...Object.values(updates)]
    )
    stats.updated++

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  // Log the run
  await db.query(
    `INSERT INTO warranty_lookup_log (tenant_id, manufacturer, total, updated, skipped, errors)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, manufacturerFilter || 'all', stats.total, stats.updated, stats.skipped, stats.errors]
  )

  console.log(`[warranty-lookup] Done: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`)
  return stats
}

module.exports = { lookupWarranty, runWarrantyLookup, getDellToken, getCiscoToken, getMerakiOrgs }
