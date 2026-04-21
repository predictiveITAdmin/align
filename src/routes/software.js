const express = require('express')
const router = express.Router()
const db = require('../db')
const { normalizeProductList } = require('../lib/softwareNormalize')

// GET /api/software — list software inventory
router.get('/', async (req, res) => {
  const { client_id, search, vendor, limit = 500 } = req.query
  try {
    const params = [req.tenant.id]
    let conditions = 'si.tenant_id = $1'

    if (client_id) {
      params.push(client_id)
      conditions += ` AND si.client_id = $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      conditions += ` AND (si.name ILIKE $${params.length} OR si.vendor ILIKE $${params.length})`
    }
    if (vendor) {
      params.push(vendor)
      conditions += ` AND si.vendor = $${params.length}`
    }

    params.push(parseInt(limit, 10) || 500)
    const limitParam = `$${params.length}`

    const result = await db.query(
      `SELECT si.id,
              si.client_id,
              c.name AS client_name,
              si.asset_id,
              a.name AS asset_name,
              si.name,
              si.version,
              si.vendor,
              si.publisher,
              si.last_seen_at
       FROM software_inventory si
       JOIN clients c ON c.id = si.client_id
       LEFT JOIN assets a ON a.id = si.asset_id
       WHERE ${conditions}
       ORDER BY si.name, c.name
       LIMIT ${limitParam}`,
      params
    )

    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[software] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch software inventory' })
  }
})

// GET /api/software/summary — aggregated software stats
router.get('/summary', async (req, res) => {
  const { client_id } = req.query
  try {
    const params = [req.tenant.id]
    let clientFilter = ''

    if (client_id) {
      params.push(client_id)
      clientFilter = ` AND si.client_id = $${params.length}`
    }

    const topSoftwareResult = await db.query(
      `SELECT si.name,
              si.vendor,
              COUNT(DISTINCT si.datto_rmm_device_id) AS device_count,
              COUNT(DISTINCT si.client_id) AS client_count
       FROM software_inventory si
       WHERE si.tenant_id = $1${clientFilter}
       GROUP BY si.name, si.vendor
       ORDER BY device_count DESC
       LIMIT 50`,
      params
    )

    const vendorCountsResult = await db.query(
      `SELECT si.vendor,
              COUNT(*) AS count
       FROM software_inventory si
       WHERE si.tenant_id = $1${clientFilter}
         AND si.vendor IS NOT NULL AND si.vendor <> ''
       GROUP BY si.vendor
       ORDER BY count DESC`,
      params
    )

    res.json({
      top_software: topSoftwareResult.rows,
      vendor_counts: vendorCountsResult.rows,
    })
  } catch (err) {
    console.error('[software] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch software summary' })
  }
})

// GET /api/software/vendors — distinct vendors for filter dropdown
router.get('/vendors', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT vendor, COUNT(*) AS count
       FROM software_inventory
       WHERE tenant_id = $1 AND vendor IS NOT NULL AND vendor <> ''
       GROUP BY vendor
       ORDER BY vendor`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[software] vendors error:', err.message)
    res.status(500).json({ error: 'Failed to fetch vendors' })
  }
})

// GET /api/software/catalog — global product catalog (all clients, for Settings management)
// Applies normalization (noise filter + product grouping) like the /products endpoint
router.get('/catalog', async (req, res) => {
  const { search, category, publisher, page = 1, per_page = 50, hide_noise = 'true', sort = 'device_count', dir = 'desc' } = req.query
  try {
    // 1. Fetch ALL distinct products (pre-pagination, since normalization merges rows)
    const result = await db.query(`
      SELECT si.name AS product_name,
             MAX(si.publisher) AS publisher,
             MAX(si.category) AS category,
             COUNT(DISTINCT si.asset_id) AS device_count,
             COUNT(DISTINCT si.client_id) AS client_count,
             MAX(si.version) AS latest_version,
             MAX(si.last_seen_at) AS last_seen_at
      FROM software_inventory si
      WHERE si.tenant_id = $1
        AND si.name IS NOT NULL AND si.name <> ''
      GROUP BY si.name
      ORDER BY device_count DESC, si.name
    `, [req.tenant.id])

    // 2. Apply normalization (noise filter + product grouping)
    const hideNoise = hide_noise !== 'false'
    let normalized = normalizeProductList(result.rows, { hideNoise })

    // 3. Get LOB apps
    const lobRes = await db.query('SELECT LOWER(name) AS name FROM tenant_lob_apps WHERE tenant_id = $1', [req.tenant.id])
    const lobSet = new Set(lobRes.rows.map(r => r.name))

    // 4. Enrich with LOB status
    normalized = normalized.map(p => ({
      ...p,
      is_lob: lobSet.has(p.product_name.toLowerCase()) ||
              (p.raw_names || []).some(rn => lobSet.has(rn.toLowerCase())),
    }))

    // 5. Apply search filter (post-normalization)
    if (search) {
      const s = search.toLowerCase()
      normalized = normalized.filter(p =>
        p.product_name.toLowerCase().includes(s) ||
        (p.publisher || '').toLowerCase().includes(s) ||
        (p.raw_names || []).some(rn => rn.toLowerCase().includes(s))
      )
    }

    // 6. Apply category filter
    if (category) {
      normalized = normalized.filter(p => p.category === category)
    }

    // 7. Apply publisher filter
    if (publisher) {
      normalized = normalized.filter(p => p.publisher === publisher)
    }

    // 8. Sort
    const sortDir = dir === 'asc' ? 1 : -1
    normalized.sort((a, b) => {
      if (sort === 'product_name') return sortDir * a.product_name.localeCompare(b.product_name)
      if (sort === 'publisher') return sortDir * (a.publisher || '').localeCompare(b.publisher || '')
      if (sort === 'category') return sortDir * (a.category || '').localeCompare(b.category || '')
      if (sort === 'client_count') return sortDir * ((a.client_count || 0) - (b.client_count || 0))
      // default: device_count
      return sortDir * ((a.device_count || 0) - (b.device_count || 0))
    })

    // 9. Build filter dropdowns from the full normalized list (before pagination)
    const pubCounts = {}, catCounts = {}
    for (const p of normalized) {
      if (p.publisher) pubCounts[p.publisher] = (pubCounts[p.publisher] || 0) + 1
      if (p.category) catCounts[p.category] = (catCounts[p.category] || 0) + 1
    }
    const publishers = Object.entries(pubCounts).map(([publisher, cnt]) => ({ publisher, cnt })).sort((a, b) => b.cnt - a.cnt)
    const categories = Object.entries(catCounts).map(([category, cnt]) => ({ category, cnt })).sort((a, b) => b.cnt - a.cnt)

    // 10. Paginate
    const total = normalized.length
    const offset = (parseInt(page) - 1) * parseInt(per_page)
    const paged = normalized.slice(offset, offset + parseInt(per_page))

    // Strip raw_names from response (internal use only)
    const products = paged.map(({ raw_names, ...rest }) => rest)

    res.json({
      data: products,
      total,
      page: parseInt(page),
      per_page: parseInt(per_page),
      publishers,
      categories,
    })
  } catch (err) {
    console.error('[software] catalog error:', err.message)
    res.status(500).json({ error: 'Failed to fetch software catalog' })
  }
})

// POST /api/software/catalog/bulk-update — batch update publisher/category/lob for multiple products
router.post('/catalog/bulk-update', async (req, res) => {
  const { updates } = req.body // [{ product_name, publisher?, category?, is_lob? }]
  if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'No updates provided' })

  try {
    let swUpdated = 0
    let lobAdded = 0
    let lobRemoved = 0

    for (const u of updates) {
      if (!u.product_name) continue

      // Update publisher/category on software_inventory
      const sets = []
      const params = [req.tenant.id, u.product_name]
      if (u.publisher !== undefined) { params.push(u.publisher || null); sets.push(`publisher = $${params.length}`) }
      if (u.category !== undefined)  { params.push(u.category || null);  sets.push(`category = $${params.length}`) }
      if (sets.length > 0) {
        sets.push('updated_at = NOW()')
        const r = await db.query(`UPDATE software_inventory SET ${sets.join(', ')} WHERE tenant_id = $1 AND name = $2`, params)
        swUpdated += r.rowCount
      }

      // LOB toggle
      if (u.is_lob === true) {
        const r = await db.query(
          `INSERT INTO tenant_lob_apps (tenant_id, name, vendor, category)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, name) DO NOTHING RETURNING id`,
          [req.tenant.id, u.product_name, u.publisher || null, u.category || 'lob']
        )
        if (r.rows.length) lobAdded++
      } else if (u.is_lob === false) {
        const r = await db.query(
          `DELETE FROM tenant_lob_apps WHERE tenant_id = $1 AND name = $2`,
          [req.tenant.id, u.product_name]
        )
        if (r.rowCount > 0) lobRemoved++
      }
    }

    res.json({ status: 'ok', sw_updated: swUpdated, lob_added: lobAdded, lob_removed: lobRemoved })
  } catch (err) {
    console.error('[software] bulk-update error:', err.message)
    res.status(500).json({ error: 'Failed to bulk update' })
  }
})

// GET /api/software/products — products grouped like LCM X (per-client)
router.get('/products', async (req, res) => {
  const { client_id, search, category, publisher, hide_noise } = req.query
  try {
    const params = [req.tenant.id]
    let clientFilter = ''
    if (client_id) { params.push(client_id); clientFilter = ` AND si.client_id = $${params.length}` }

    let searchFilter = ''
    if (search) { params.push(`%${search}%`); searchFilter = ` AND (si.name ILIKE $${params.length} OR si.publisher ILIKE $${params.length})` }

    let catFilter = ''
    if (category) { params.push(category); catFilter = ` AND si.category = $${params.length}` }

    let pubFilter = ''
    if (publisher) { params.push(publisher); pubFilter = ` AND si.publisher = $${params.length}` }

    // Get total device count for this client for "not installed" calc
    let totalDevices = 0
    if (client_id) {
      const tc = await db.query(`SELECT count(*) FROM assets WHERE client_id = $1 AND tenant_id = $2`, [client_id, req.tenant.id])
      totalDevices = parseInt(tc.rows[0]?.count || 0)
    }

    const result = await db.query(`
      SELECT si.name AS product_name,
             si.publisher,
             si.category,
             COUNT(DISTINCT COALESCE(si.asset_id::text, si.datto_rmm_device_id)) AS installed_count,
             MAX(si.version) AS latest_version,
             MAX(si.last_seen_at) AS last_seen_at
      FROM software_inventory si
      WHERE si.tenant_id = $1${clientFilter}${searchFilter}${catFilter}${pubFilter}
        AND si.name IS NOT NULL AND si.name <> ''
      GROUP BY si.name, si.publisher, si.category
      ORDER BY installed_count DESC, si.name
    `, params)

    const rawProducts = result.rows.map(p => ({
      ...p,
      installed_count: parseInt(p.installed_count),
      not_installed_count: Math.max(0, totalDevices - parseInt(p.installed_count)),
    }))

    // Apply normalization (grouping + noise filter) — default ON unless hide_noise=false
    const shouldHideNoise = hide_noise !== 'false'
    const products = normalizeProductList(rawProducts, { hideNoise: shouldHideNoise })

    // Recalc not_installed_count after grouping
    products.forEach(p => {
      p.not_installed_count = Math.max(0, totalDevices - p.installed_count)
    })

    res.json({ data: products, total_devices: totalDevices })
  } catch (err) {
    console.error('[software] products error:', err.message)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET /api/software/products/:name/devices — devices with a specific product installed
router.get('/products/:name/devices', async (req, res) => {
  const { client_id } = req.query
  const productName = decodeURIComponent(req.params.name)
  try {
    const params = [req.tenant.id, productName]
    let clientFilter = ''
    if (client_id) { params.push(client_id); clientFilter = ` AND si.client_id = $${params.length}` }

    const result = await db.query(`
      SELECT si.id, si.asset_id, si.version, si.publisher, si.install_date, si.last_seen_at,
             a.name AS device_name, a.manufacturer, a.serial_number, a.model,
             at.name AS device_type,
             c.name AS client_name
      FROM software_inventory si
      LEFT JOIN assets a ON a.id = si.asset_id
      LEFT JOIN asset_types at ON at.id = a.asset_type_id
      LEFT JOIN clients c ON c.id = si.client_id
      WHERE si.tenant_id = $1 AND si.name = $2${clientFilter}
      ORDER BY a.name
    `, params)

    res.json({ data: result.rows })
  } catch (err) {
    console.error('[software] product devices error:', err.message)
    res.status(500).json({ error: 'Failed to fetch product devices' })
  }
})

// GET /api/software/device/:assetId — all software on a specific device
router.get('/device/:assetId', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT si.id, si.name, si.version, si.vendor, si.publisher, si.category,
             si.install_date, si.last_seen_at
      FROM software_inventory si
      WHERE si.asset_id = $1 AND si.tenant_id = $2
      ORDER BY si.publisher, si.name
    `, [req.params.assetId, req.tenant.id])

    res.json({ data: result.rows })
  } catch (err) {
    console.error('[software] device software error:', err.message)
    res.status(500).json({ error: 'Failed to fetch device software' })
  }
})

// GET /api/software/categories — distinct categories for filter
router.get('/categories', async (req, res) => {
  const { client_id } = req.query
  try {
    const params = [req.tenant.id]
    let clientFilter = ''
    if (client_id) { params.push(client_id); clientFilter = ` AND client_id = $${params.length}` }

    const result = await db.query(`
      SELECT category, COUNT(DISTINCT name) AS product_count,
             COUNT(*) AS device_count
      FROM software_inventory
      WHERE tenant_id = $1${clientFilter}
        AND category IS NOT NULL AND category <> ''
      GROUP BY category
      ORDER BY device_count DESC
    `, params)
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// PATCH /api/software/product/:name — update publisher/category on all records with this product name
router.patch('/product/:name', async (req, res) => {
  const { publisher, category } = req.body
  const productName = decodeURIComponent(req.params.name)
  try {
    const sets = []
    const params = [req.tenant.id, productName]
    if (publisher !== undefined) { params.push(publisher || null); sets.push(`publisher = $${params.length}`) }
    if (category !== undefined)  { params.push(category || null);  sets.push(`category = $${params.length}`) }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    sets.push('updated_at = NOW()')
    const result = await db.query(
      `UPDATE software_inventory SET ${sets.join(', ')} WHERE tenant_id = $1 AND name = $2`,
      params
    )
    res.json({ status: 'ok', updated: result.rowCount })
  } catch (err) {
    console.error('[software] update error:', err.message)
    res.status(500).json({ error: 'Failed to update software' })
  }
})

// PATCH /api/software/:id — update a single software record
router.patch('/:id', async (req, res) => {
  const { publisher, category } = req.body
  try {
    const sets = []
    const params = [req.params.id, req.tenant.id]
    if (publisher !== undefined) { params.push(publisher || null); sets.push(`publisher = $${params.length}`) }
    if (category !== undefined)  { params.push(category || null);  sets.push(`category = $${params.length}`) }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    sets.push('updated_at = NOW()')
    const result = await db.query(
      `UPDATE software_inventory SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[software] update error:', err.message)
    res.status(500).json({ error: 'Failed to update software' })
  }
})

// POST /api/software/infer-publishers — bulk infer publisher from software name patterns
router.post('/infer-publishers', async (req, res) => {
  try {
    const PUBLISHER_PATTERNS = [
      ['Microsoft', /^Microsoft /i],
      ['Adobe', /^Adobe /i],
      ['Google', /^Google /i],
      ['Apple', /^Apple /i],
      ['Cisco', /^Cisco /i],
      ['Dell', /^Dell /i],
      ['HP', /^HP /i],
      ['Lenovo', /^Lenovo /i],
      ['VMware', /^VMware /i],
      ['Intel', /^Intel[\s(®]/i],
      ['Datto', /^Datto /i],
      ['SentinelOne', /^SentinelOne/i],
      ['CrowdStrike', /^CrowdStrike/i],
      ['Webroot', /^Webroot/i],
      ['Malwarebytes', /^Malwarebytes/i],
      ['Sophos', /^Sophos/i],
      ['ESET', /^ESET /i],
      ['Bitdefender', /^Bitdefender/i],
      ['Mozilla', /^Mozilla /i],
      ['Oracle', /^Oracle|^Java /i],
      ['Intuit', /QuickBooks/i],
      ['Zoom', /^Zoom /i],
      ['Slack', /^Slack /i],
      ['Dropbox', /^Dropbox/i],
      ['TeamViewer', /^TeamViewer/i],
      ['Splashtop', /^Splashtop/i],
      ['ConnectWise', /^ConnectWise|^ScreenConnect/i],
      ['Veeam', /^Veeam /i],
      ['Acronis', /^Acronis/i],
      ['Foxit', /^Foxit /i],
      ['Autodesk', /^Autodesk|^AutoCAD/i],
      ['NVIDIA', /^NVIDIA/i],
      ['AMD', /^AMD /i],
      ['Realtek', /^Realtek/i],
      ['Python', /^Python /i],
      ['Node.js', /^Node\.js/i],
      ['NinjaRMM', /^NinjaRMM|^Ninja /i],
      ['Huntress', /^Huntress/i],
      ['Kaseya', /^Kaseya/i],
      ['LogMeIn', /^LogMeIn/i],
      ['Citrix', /^Citrix /i],
      ['Fortinet', /^Forti/i],
      ['SonicWall', /^SonicWall/i],
      ['Palo Alto', /^GlobalProtect|^Palo Alto/i],
      ['Sage', /^Sage /i],
      ['SAP', /^SAP /i],
      ['Symantec', /^Symantec|^Norton/i],
    ]

    let totalUpdated = 0
    for (const [publisher, pattern] of PUBLISHER_PATTERNS) {
      // Convert regex to SQL SIMILAR TO or use a simple approach: fetch names, match, batch update
      const result = await db.query(
        `UPDATE software_inventory SET publisher = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND publisher IS NULL AND name ~* $3`,
        [publisher, req.tenant.id, pattern.source]
      )
      totalUpdated += result.rowCount
    }

    res.json({ status: 'ok', updated: totalUpdated })
  } catch (err) {
    console.error('[software] infer-publishers error:', err.message)
    res.status(500).json({ error: 'Failed to infer publishers' })
  }
})

module.exports = router
