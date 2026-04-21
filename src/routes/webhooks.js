/**
 * /api/webhooks/:adapter — inbound webhooks from distributor APIs
 *
 * Flow:
 *   1. Distributor POSTs an event to /api/webhooks/<adapter_key>
 *      (e.g. /api/webhooks/ingram for im::order_shipped)
 *   2. We verify signature (per-adapter scheme)
 *   3. Adapter's handleWebhook() parses the payload → normalized orders
 *   4. We upsert + log order_events + fire matcher
 *
 * This endpoint is UNAUTHENTICATED by design (distributors can't send our JWT).
 * Security is via signature verification against webhook_secret stored per
 * supplier row.
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { getAdapter } = require('../services/distributors')

// Note: express.json() is already applied at the app level in server.js
// For signature verification we may need raw body — handled per-adapter if needed

// ─── POST /api/webhooks/:adapter — generic inbound handler ──────────────────
// :adapter is a short key: 'ingram', 'synnex', 'amazon', etc.
// Adapter lookup maps short keys → full adapter_key in the adapters registry.

const SHORT_TO_FULL = {
  ingram:   'ingram_xi',
  synnex:   'tdsynnex_ecx',
  amazon:   'amazon_business_csv',
  provantage: 'provantage_manual',
}

router.post('/:adapter', async (req, res) => {
  const adapterKey = SHORT_TO_FULL[req.params.adapter] || req.params.adapter
  const adapter = getAdapter(adapterKey)
  if (!adapter) {
    console.warn(`[webhooks] unknown adapter: ${req.params.adapter}`)
    return res.status(404).json({ error: 'Unknown adapter' })
  }

  // Find the supplier config by adapter_key (and optionally webhook_url_suffix
  // if present — future enhancement for per-supplier webhooks)
  const supplierRes = await db.query(
    `SELECT id, tenant_id, webhook_secret
     FROM suppliers
     WHERE adapter_key = $1 AND is_enabled = true
     LIMIT 1`,
    [adapterKey]
  )

  if (!supplierRes.rows.length) {
    console.warn(`[webhooks] no enabled supplier for adapter: ${adapterKey}`)
    // Still return 200 so the distributor doesn't retry forever
    return res.status(200).json({ status: 'no_supplier' })
  }

  const supplier = supplierRes.rows[0]

  try {
    const signature = req.headers['x-signature'] || req.headers['x-hub-signature-256'] || null
    const normalizedOrders = await adapter.handleWebhook(req.body, signature, supplier.webhook_secret)

    let upserted = 0
    for (const order of (normalizedOrders || [])) {
      try {
        await upsertOrderFromWebhook(supplier, order, adapterKey)
        upserted++
      } catch (err) {
        console.error(`[webhooks] upsert failed for order ${order?.distributor_order_id}:`, err.message)
      }
    }

    console.log(`[webhooks] ${adapterKey}: processed ${upserted} order(s)`)
    res.json({ status: 'ok', processed: upserted })
  } catch (err) {
    console.error(`[webhooks] ${adapterKey} error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

async function upsertOrderFromWebhook(supplier, normalized, adapterKey) {
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
        status          = COALESCE(EXCLUDED.status, distributor_orders.status),
        status_raw      = COALESCE(EXCLUDED.status_raw, distributor_orders.status_raw),
        subtotal        = COALESCE(EXCLUDED.subtotal, distributor_orders.subtotal),
        tax             = COALESCE(EXCLUDED.tax, distributor_orders.tax),
        shipping        = COALESCE(EXCLUDED.shipping, distributor_orders.shipping),
        total           = COALESCE(EXCLUDED.total, distributor_orders.total),
        ship_to_name    = COALESCE(EXCLUDED.ship_to_name, distributor_orders.ship_to_name),
        ship_to_address = COALESCE(EXCLUDED.ship_to_address, distributor_orders.ship_to_address),
        metadata        = EXCLUDED.metadata,
        last_synced_at  = NOW(),
        updated_at      = NOW()
      RETURNING id
    `, [
      supplier.tenant_id, supplier.id, adapterKey,
      normalized.distributor_order_id, normalized.po_number,
      normalized.order_date, normalized.status, normalized.status_raw,
      normalized.subtotal, normalized.tax, normalized.shipping, normalized.total,
      normalized.currency || 'USD',
      normalized.ship_to_name, normalized.ship_to_address || null,
      normalized.metadata || null,
    ])
    const orderId = orderRes.rows[0].id

    // Items
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
        orderId, item.distributor_line_id, item.mfg_part_number,
        item.manufacturer, item.description,
        item.quantity_ordered || 0, item.quantity_shipped || 0,
        item.quantity_backordered || 0, item.quantity_cancelled || 0,
        item.unit_cost, item.line_total,
        item.tracking_number, item.carrier, item.ship_date, item.expected_delivery,
        item.serial_numbers || [],
        item.metadata || null,
      ])
    }

    // Event log entry
    await client.query(`
      INSERT INTO order_events (distributor_order_id, event_type, description, actor, metadata)
      VALUES ($1, 'status_change', $2, 'system', $3)
    `, [
      orderId,
      `Webhook event: ${normalized.status_raw || normalized.status || 'update'}`,
      JSON.stringify({ source: 'webhook', adapter: adapterKey }),
    ])

    await client.query('COMMIT')

    // Update supplier sync metadata
    await db.query(
      `UPDATE suppliers SET last_sync_at = NOW(), last_sync_status = 'ok' WHERE id = $1`,
      [supplier.id]
    )
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── GET /api/webhooks/:adapter — health-check endpoint ─────────────────────
// Some distributor portals ping this to verify the URL is reachable before
// enabling webhook subscriptions.
router.get('/:adapter', (req, res) => {
  const adapterKey = SHORT_TO_FULL[req.params.adapter] || req.params.adapter
  const adapter = getAdapter(adapterKey)
  if (!adapter) return res.status(404).json({ error: 'Unknown adapter' })
  res.json({
    status: 'ok',
    adapter: adapter.displayName,
    message: 'Webhook endpoint is reachable. POST events here.',
  })
})

module.exports = router
