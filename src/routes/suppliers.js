/**
 * /api/suppliers — Admin UI for distributor API configuration.
 * Handles: list adapters, list configured suppliers, create/update, test, CSV import.
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { getAdapter, listAdapters } = require('../services/distributors')
const crypto = require('crypto')
const {
  encryptCredentials, decryptCredentials, maskCredentials,
} = require('../services/supplierCrypto')

// ─── GET /api/suppliers/adapters — list available distributor adapters ───────
router.get('/adapters', requireAuth, (req, res) => {
  res.json({ data: listAdapters() })
})

// ─── GET /api/suppliers — list configured suppliers for this tenant ──────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, adapter_key, display_name, is_enabled, sync_mode,
              sync_frequency_minutes, customer_number, base_url, environment,
              webhook_url_suffix,
              last_test_at, last_test_status, last_test_error,
              last_sync_at, last_sync_status, last_sync_error,
              created_at, updated_at
       FROM suppliers WHERE tenant_id = $1 ORDER BY display_name`,
      [req.tenant.id]
    )
    res.json({ data: r.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/suppliers/:id — detail with masked credentials ─────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' })

    const supplier = r.rows[0]
    const adapter = getAdapter(supplier.adapter_key)
    const decrypted = decryptCredentials(supplier.credentials)
    const masked = maskCredentials(decrypted, adapter?.requiredFields || [])

    res.json({ data: { ...supplier, credentials: masked } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/suppliers — create / configure a supplier ────────────────────
router.post('/', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  const { adapter_key, display_name, is_enabled, sync_mode, sync_frequency_minutes,
          customer_number, credentials, base_url, environment } = req.body

  if (!adapter_key) return res.status(400).json({ error: 'adapter_key required' })
  const adapter = getAdapter(adapter_key)
  if (!adapter) return res.status(400).json({ error: 'unknown adapter_key' })

  try {
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const webhookSuffix = crypto.randomBytes(8).toString('hex')

    const encryptedCreds = encryptCredentials(credentials || {})

    const r = await db.query(
      `INSERT INTO suppliers (
         tenant_id, adapter_key, display_name, is_enabled, sync_mode,
         sync_frequency_minutes, customer_number, credentials, base_url,
         environment, webhook_url_suffix, webhook_secret
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, adapter_key) DO UPDATE SET
         display_name           = EXCLUDED.display_name,
         is_enabled             = EXCLUDED.is_enabled,
         sync_mode              = EXCLUDED.sync_mode,
         sync_frequency_minutes = EXCLUDED.sync_frequency_minutes,
         customer_number        = EXCLUDED.customer_number,
         credentials            = EXCLUDED.credentials,
         base_url               = EXCLUDED.base_url,
         environment            = EXCLUDED.environment,
         updated_at             = NOW()
       RETURNING *`,
      [
        req.tenant.id, adapter_key, display_name || adapter.displayName,
        is_enabled ?? false, sync_mode || adapter.supportedSyncModes[0],
        sync_frequency_minutes || 60,
        customer_number || null, encryptedCreds, base_url || adapter.defaults?.base_url || null,
        environment || adapter.defaults?.environment || 'production',
        webhookSuffix, webhookSecret,
      ]
    )
    res.status(201).json({ data: r.rows[0] })
  } catch (err) {
    console.error('[suppliers] create error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/suppliers/:id/test — run testConnection on the adapter ────────
router.post('/:id/test', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' })
    const supplier = r.rows[0]

    const adapter = getAdapter(supplier.adapter_key)
    if (!adapter) return res.status(400).json({ error: 'No adapter for this supplier' })

    // Merge any just-submitted creds with stored (for pre-save test)
    let creds = decryptCredentials(supplier.credentials || {})
    if (req.body?.credentials) {
      // If values are not the masked placeholder (••••...), use incoming
      for (const [k, v] of Object.entries(req.body.credentials)) {
        if (v && typeof v === 'string' && !v.startsWith('••••')) creds[k] = v
      }
    }

    // Inject customer_number from supplier row if the adapter expects it
    if (supplier.customer_number && !creds.customer_number) {
      creds.customer_number = supplier.customer_number
    }

    const config = {
      environment: req.body?.environment || supplier.environment || adapter.defaults?.environment,
      base_url:    req.body?.base_url || supplier.base_url || adapter.defaults?.base_url,
    }

    const result = await adapter.testConnection(creds, config)

    await db.query(
      `UPDATE suppliers SET
         last_test_at     = NOW(),
         last_test_status = $2,
         last_test_error  = $3
       WHERE id = $1`,
      [req.params.id, result.ok ? 'ok' : 'failed', result.ok ? null : result.message]
    )

    res.json({ data: result })
  } catch (err) {
    console.error('[suppliers] test error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/suppliers/import/amazon — parse + import Amazon Business CSV ───
// Accepts { csv_content: string } in JSON body.
// Finds the tenant's amazon_business_csv supplier record (or creates a placeholder),
// parses the CSV, upserts each order, runs the matcher, returns stats.
router.post('/import/amazon', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  const { csv_content } = req.body
  if (!csv_content || typeof csv_content !== 'string' || csv_content.trim().length < 10) {
    return res.status(400).json({ error: 'csv_content is required' })
  }

  const amazonAdapter = getAdapter('amazon_business_csv')
  if (!amazonAdapter) return res.status(500).json({ error: 'Amazon Business adapter not found' })

  let normalizedOrders
  try {
    normalizedOrders = amazonAdapter.parseCsv(csv_content)
  } catch (parseErr) {
    return res.status(422).json({ error: 'CSV parse failed: ' + parseErr.message })
  }

  if (!normalizedOrders.length) {
    return res.status(422).json({ error: 'No orders found in CSV. Check the file format.' })
  }

  // Find or create a supplier row for amazon_business_csv
  let supplierRes = await db.query(
    `SELECT id, tenant_id FROM suppliers WHERE tenant_id = $1 AND adapter_key = 'amazon_business_csv'`,
    [req.tenant.id]
  )

  let supplierId
  if (!supplierRes.rows.length) {
    // Auto-create a minimal record so orders can reference it
    const secret = crypto.randomBytes(32).toString('hex')
    const suffix = crypto.randomBytes(8).toString('hex')
    const newSupplier = await db.query(
      `INSERT INTO suppliers (tenant_id, adapter_key, display_name, is_enabled, sync_mode,
                              webhook_url_suffix, webhook_secret)
       VALUES ($1, 'amazon_business_csv', 'Amazon Business', true, 'csv_import', $2, $3)
       ON CONFLICT (tenant_id, adapter_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [req.tenant.id, suffix, secret]
    )
    supplierId = newSupplier.rows[0].id
  } else {
    supplierId = supplierRes.rows[0].id
  }

  const { upsertOrder } = require('../services/distributorSync')
  const { matchOrder }   = require('../services/orderMatcher')

  let imported = 0, matched = 0, errors = 0
  for (const order of normalizedOrders) {
    try {
      const orderId = await upsertOrder(req.tenant.id, supplierId, 'amazon_business_csv', order)
      imported++
      try {
        const result = await matchOrder(req.tenant.id, orderId)
        if (result.confidence >= 80) matched++
      } catch {
        // matcher failure non-fatal
      }
    } catch (err) {
      errors++
      console.error('[suppliers/import/amazon] upsert error:', err.message)
    }
  }

  // Update last_sync_at
  await db.query(
    `UPDATE suppliers SET last_sync_at = NOW(), last_sync_status = 'ok' WHERE id = $1`,
    [supplierId]
  )

  console.log(`[suppliers/import/amazon] tenant ${req.tenant.id}: parsed=${normalizedOrders.length} imported=${imported} matched=${matched} errors=${errors}`)
  res.json({ status: 'ok', parsed: normalizedOrders.length, imported, matched, errors })
})

// ─── POST /api/suppliers/import/ingram — parse + import Ingram Shipments CSV ─
// Accepts { csv_content: string }. Stores orders with distributor='ingram_xi' so
// CSV-imported rows dedupe against live-API rows via the (distributor,
// distributor_order_id) unique key. Dupe rows get their fields enriched/filled in.
router.post('/import/ingram', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  const { csv_content } = req.body
  if (!csv_content || typeof csv_content !== 'string' || csv_content.trim().length < 10) {
    return res.status(400).json({ error: 'csv_content is required' })
  }

  const ingramAdapter = getAdapter('ingram_xi_csv')
  if (!ingramAdapter) return res.status(500).json({ error: 'Ingram CSV adapter not found' })

  let normalizedOrders
  try {
    normalizedOrders = ingramAdapter.parseCsv(csv_content)
  } catch (parseErr) {
    return res.status(422).json({ error: 'CSV parse failed: ' + parseErr.message })
  }

  if (!normalizedOrders.length) {
    return res.status(422).json({ error: 'No orders found in CSV. Check the file format — expected columns: Order date, Reseller PO, Order Type, Order number, Order amount, Status, Shipped date, ETA, End customer, Order placed by, Delivery exception.' })
  }

  // Find or create a supplier row for ingram_xi_csv (separate from live-API supplier
  // so the /qa/stats and Ingram adapter history don't commingle).
  let supplierRes = await db.query(
    `SELECT id FROM suppliers WHERE tenant_id = $1 AND adapter_key = 'ingram_xi_csv'`,
    [req.tenant.id]
  )
  let supplierId
  if (!supplierRes.rows.length) {
    const secret = crypto.randomBytes(32).toString('hex')
    const suffix = crypto.randomBytes(8).toString('hex')
    const newSupplier = await db.query(
      `INSERT INTO suppliers (tenant_id, adapter_key, display_name, is_enabled, sync_mode,
                              webhook_url_suffix, webhook_secret)
       VALUES ($1, 'ingram_xi_csv', 'Ingram Micro (CSV Import)', true, 'csv_import', $2, $3)
       ON CONFLICT (tenant_id, adapter_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [req.tenant.id, suffix, secret]
    )
    supplierId = newSupplier.rows[0].id
  } else {
    supplierId = supplierRes.rows[0].id
  }

  const { upsertOrder } = require('../services/distributorSync')
  const { matchOrder }   = require('../services/orderMatcher')

  // Use adapter.distributorKey so orders land with distributor='ingram_xi'
  // (same as live API) — lets the (distributor, distributor_order_id) unique
  // constraint merge CSV imports with any existing API rows.
  const distributorKey = ingramAdapter.distributorKey || ingramAdapter.adapterKey

  let imported = 0, matched = 0, errors = 0
  for (const order of normalizedOrders) {
    try {
      const orderId = await upsertOrder(req.tenant.id, supplierId, distributorKey, order)
      imported++
      try {
        const result = await matchOrder(req.tenant.id, orderId)
        if (result.confidence >= 80) matched++
      } catch {
        // matcher failure non-fatal
      }
    } catch (err) {
      errors++
      console.error('[suppliers/import/ingram] upsert error:', err.message)
    }
  }

  await db.query(
    `UPDATE suppliers SET last_sync_at = NOW(), last_sync_status = 'ok' WHERE id = $1`,
    [supplierId]
  )

  console.log(`[suppliers/import/ingram] tenant ${req.tenant.id}: parsed=${normalizedOrders.length} imported=${imported} matched=${matched} errors=${errors}`)
  res.json({ status: 'ok', parsed: normalizedOrders.length, imported, matched, errors })
})

// ─── DELETE /api/suppliers/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
