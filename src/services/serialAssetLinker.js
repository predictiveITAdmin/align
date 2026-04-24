/**
 * Serial → Asset Linker
 *
 * When distributor orders deliver hardware with serial numbers, link the
 * serials to existing Autotask Configuration Items (assets) for the same
 * tenant. Creates a row in `order_item_assignments` for each (item, serial)
 * pair so we have provenance — which order a given asset came from.
 *
 * Runs after every sync. Also exposed via POST /api/orders/:id/link-assets.
 */

const db = require('../db')

// ─── normalize — strip whitespace + uppercase for comparison ──────────────────
function _norm(s) {
  return (s || '').toString().trim().toUpperCase()
}

// ─── linkSerialsForOrder — link one order's serials to assets ────────────────
/**
 * Walks every item with serial_numbers[], finds matching assets by serial,
 * and inserts order_item_assignments rows. Skips pairs already linked.
 *
 * @returns {Promise<{linked: number, unmatched: string[]}>}
 */
async function linkSerialsForOrder(orderId, tenantId) {
  const ord = await db.query(
    `SELECT id, client_id FROM distributor_orders
      WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  )
  if (!ord.rows.length) return { linked: 0, unmatched: [] }
  const clientId = ord.rows[0].client_id

  const items = await db.query(
    `SELECT id, serial_numbers
       FROM distributor_order_items
      WHERE distributor_order_id = $1
        AND serial_numbers IS NOT NULL
        AND array_length(serial_numbers, 1) > 0`,
    [orderId]
  )
  if (!items.rows.length) return { linked: 0, unmatched: [] }

  let linked = 0
  const unmatched = []

  for (const item of items.rows) {
    for (const raw of (item.serial_numbers || [])) {
      const serial = _norm(raw)
      if (!serial) continue

      // Find asset by serial (case-insensitive). Prefer same client, but fall
      // back to any asset for the tenant so we still catch matches even if the
      // order's client_id hasn't been resolved yet.
      const assetRes = await db.query(
        `SELECT id, client_id
           FROM assets
          WHERE tenant_id = $1
            AND UPPER(TRIM(serial_number)) = $2
          ORDER BY (client_id = $3) DESC NULLS LAST
          LIMIT 1`,
        [tenantId, serial, clientId]
      )

      if (!assetRes.rows.length) {
        unmatched.push(raw)
        continue
      }

      const assetId = assetRes.rows[0].id

      // Idempotent insert — skip if already linked
      const existing = await db.query(
        `SELECT 1 FROM order_item_assignments
          WHERE distributor_order_item_id = $1 AND serial_number = $2`,
        [item.id, raw]
      )
      if (existing.rows.length) continue

      await db.query(
        `INSERT INTO order_item_assignments
           (distributor_order_item_id, assignment_type, serial_number, asset_id)
         VALUES ($1, 'new', $2, $3)`,
        [item.id, raw, assetId]
      )
      linked++
    }
  }

  return { linked, unmatched }
}

// ─── linkSerialsForTenant — bulk run for every order with serials ────────────
async function linkSerialsForTenant(tenantId) {
  const orders = await db.query(
    `SELECT DISTINCT o.id
       FROM distributor_orders o
       JOIN distributor_order_items i ON i.distributor_order_id = o.id
      WHERE o.tenant_id = $1
        AND i.serial_numbers IS NOT NULL
        AND array_length(i.serial_numbers, 1) > 0`,
    [tenantId]
  )

  let linked = 0
  let unmatched = 0
  for (const row of orders.rows) {
    try {
      const r = await linkSerialsForOrder(row.id, tenantId)
      linked += r.linked
      unmatched += r.unmatched.length
    } catch (err) {
      console.warn(`[serialAssetLinker] order ${row.id} failed:`, err.message)
    }
  }

  if (linked > 0) {
    console.log(`[serialAssetLinker] tenant ${tenantId}: ${linked} asset links created, ${unmatched} serials unmatched`)
  }
  return { linked, unmatched }
}

module.exports = { linkSerialsForOrder, linkSerialsForTenant }
