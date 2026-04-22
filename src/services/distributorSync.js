/**
 * Distributor Sync Service
 *
 * For each tenant, finds all enabled suppliers with sync_mode = 'api' and:
 *   1. Decrypts credentials via supplierCrypto
 *   2. Gets the registered adapter
 *   3. Fetches orders since last_sync_at (incremental)
 *   4. Upserts distributor_orders + items into the DB
 *   5. Runs the order matcher on newly synced orders
 *   6. Updates supplier last_sync_at + last_sync_status
 *
 * Called from scheduler.js (hourly), or manually via POST /api/suppliers/:id/sync.
 */

const db = require('../db')
const { getAdapter } = require('./distributors')
const { decryptCredentials } = require('./supplierCrypto')
const { matchOrder } = require('./orderMatcher')

// ─── syncSupplier — sync one supplier for its tenant ─────────────────────────
async function syncSupplier(supplier) {
  const { id: supplierId, tenant_id: tenantId, adapter_key, credentials: encryptedCreds, environment, base_url } = supplier

  const adapter = getAdapter(adapter_key)
  if (!adapter) {
    console.warn(`[distributorSync] no adapter for key: ${adapter_key}`)
    return { ok: false, error: 'Unknown adapter' }
  }

  if (!adapter.fetchOrders) {
    // CSV-only adapters (amazon_business_csv, provantage_manual) have no fetchOrders
    console.log(`[distributorSync] ${adapter_key}: no fetchOrders (CSV/manual mode), skipping`)
    return { ok: true, skipped: true }
  }

  const creds = decryptCredentials(encryptedCreds || {})
  const config = { environment: environment || 'production', base_url }

  // Incremental: use last successful sync as the since date
  const since = supplier.last_sync_at || null

  console.log(`[distributorSync] ${adapter_key} (tenant ${tenantId}): syncing since ${since || '(full)'}`)

  let upserted = 0, matched_count = 0, errors = 0

  try {
    for await (const normalizedOrder of adapter.fetchOrders(creds, config, since)) {
      try {
        const orderId = await upsertOrder(tenantId, supplierId, adapter_key, normalizedOrder)
        upserted++

        // Run matcher on this order
        try {
          await matchOrder(tenantId, orderId)
          matched_count++
        } catch (matchErr) {
          console.warn(`[distributorSync] matcher failed for order ${orderId}:`, matchErr.message)
        }
      } catch (upsertErr) {
        errors++
        console.error(`[distributorSync] upsert failed for order ${normalizedOrder?.distributor_order_id}:`, upsertErr.message)
      }
    }

    // Mark supplier sync success
    await db.query(
      `UPDATE suppliers SET last_sync_at = NOW(), last_sync_status = 'ok', last_sync_error = NULL WHERE id = $1`,
      [supplierId]
    )

    console.log(`[distributorSync] ${adapter_key}: upserted=${upserted} matched=${matched_count} errors=${errors}`)
    return { ok: true, upserted, matched: matched_count, errors }
  } catch (err) {
    // Mark supplier sync failure
    await db.query(
      `UPDATE suppliers SET last_sync_at = NOW(), last_sync_status = 'error', last_sync_error = $2 WHERE id = $1`,
      [supplierId, err.message]
    )
    console.error(`[distributorSync] ${adapter_key} FAILED:`, err.message)
    return { ok: false, error: err.message }
  }
}

// ─── upsertOrder — insert/update one normalized order + its items ─────────────
async function upsertOrder(tenantId, supplierId, adapterKey, normalized) {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    const orderRes = await client.query(`
      INSERT INTO distributor_orders (
        tenant_id, supplier_id, distributor, distributor_order_id, po_number,
        order_date, status, status_raw,
        subtotal, tax, shipping, total, currency,
        ship_to_name, ship_to_address, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (distributor, distributor_order_id) DO UPDATE SET
        status          = COALESCE(EXCLUDED.status,          distributor_orders.status),
        status_raw      = COALESCE(EXCLUDED.status_raw,      distributor_orders.status_raw),
        subtotal        = COALESCE(EXCLUDED.subtotal,        distributor_orders.subtotal),
        tax             = COALESCE(EXCLUDED.tax,             distributor_orders.tax),
        shipping        = COALESCE(EXCLUDED.shipping,        distributor_orders.shipping),
        total           = COALESCE(EXCLUDED.total,           distributor_orders.total),
        ship_to_name    = COALESCE(EXCLUDED.ship_to_name,    distributor_orders.ship_to_name),
        ship_to_address = COALESCE(EXCLUDED.ship_to_address, distributor_orders.ship_to_address),
        metadata        = EXCLUDED.metadata,
        last_synced_at  = NOW(),
        updated_at      = NOW()
      RETURNING id
    `, [
      tenantId, supplierId, adapterKey,
      normalized.distributor_order_id, normalized.po_number,
      normalized.order_date, normalized.status, normalized.status_raw,
      normalized.subtotal, normalized.tax, normalized.shipping, normalized.total,
      normalized.currency || 'USD',
      normalized.ship_to_name, normalized.ship_to_address || null,
      normalized.metadata || null,
    ])

    const orderId = orderRes.rows[0].id

    // Upsert line items
    for (const item of (normalized.items || [])) {
      await client.query(`
        INSERT INTO distributor_order_items (
          distributor_order_id, distributor_line_id, mfg_part_number,
          manufacturer, description,
          quantity_ordered, quantity_shipped, quantity_backordered, quantity_cancelled,
          unit_cost, line_total,
          tracking_number, carrier, ship_date, expected_delivery, serial_numbers,
          metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT DO NOTHING
      `, [
        orderId,
        item.distributor_line_id, item.mfg_part_number,
        item.manufacturer, item.description,
        item.quantity_ordered || 0, item.quantity_shipped || 0,
        item.quantity_backordered || 0, item.quantity_cancelled || 0,
        item.unit_cost, item.line_total,
        item.tracking_number, item.carrier, item.ship_date,
        item.expected_delivery, item.serial_numbers || [],
        item.metadata || null,
      ])
    }

    await client.query('COMMIT')
    return orderId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── syncAllSuppliers — run for a single tenant ───────────────────────────────
async function syncAllSuppliers(tenantId) {
  const suppliersRes = await db.query(
    `SELECT id, tenant_id, adapter_key, credentials, environment, base_url,
            sync_mode, last_sync_at
     FROM suppliers
     WHERE tenant_id = $1 AND is_enabled = true AND sync_mode = 'api'`,
    [tenantId]
  )

  if (!suppliersRes.rows.length) return { ok: true, skipped: true }

  const results = []
  for (const supplier of suppliersRes.rows) {
    const result = await syncSupplier(supplier)
    results.push({ adapter_key: supplier.adapter_key, ...result })
  }
  return { ok: true, results }
}

module.exports = { syncAllSuppliers, syncSupplier, upsertOrder }
