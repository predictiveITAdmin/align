/**
 * Carrier Tracking Service — EasyPost integration
 *
 * Uses the EasyPost free tracking API to get real delivery confirmation rather
 * than inferring delivery from elapsed calendar days.
 *
 * EasyPost free tier: no volume limits, supports UPS/FedEx/USPS/DHL/OnTrac.
 * Auth: HTTP Basic with API key as username, empty password.
 * Docs: https://docs.easypost.com/docs/trackers
 *
 * Set EASYPOST_API_KEY in .env to enable.  If the key is absent the service
 * degrades gracefully (logs a warning, returns 0 updates).
 */

const axios = require('axios')
const db    = require('../db')

const EASYPOST_BASE = 'https://api.easypost.com/v2'

// ─── Carrier detection from tracking number format ────────────────────────────
function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null
  const t = trackingNumber.trim()
  if (/^1Z/i.test(t))                          return 'UPS'
  if (/^(94|93|92|420|91)\d/.test(t))          return 'USPS'
  if (/^[0-9]{15,22}$/.test(t))                return 'FedEx'
  if (/^(JD|GM|LY)\d/i.test(t))               return 'DHL'
  if (/^[0-9]{10,11}$/.test(t))               return 'OnTrac'
  return null
}

// ─── EasyPost status → our order status enum ─────────────────────────────────
const EP_STATUS_MAP = {
  delivered:            'delivered',
  out_for_delivery:     'out_for_delivery',
  in_transit:           'shipped',
  pre_transit:          'confirmed',
  available_for_pickup: 'out_for_delivery',
  return_to_sender:     'returned',
  failure:              'exception',
  error:                'exception',
  unknown:              null,  // no status change
}

// ─── trackPackage — create/refresh one EasyPost tracker ───────────────────────
/**
 * @param {string} trackingNumber
 * @param {string|null} carrierHint  — e.g. 'UPS', 'FedEx', 'USPS'
 * @returns {Promise<{tracking_number, carrier, status, normalized_status, est_delivery, signed_by}>}
 */
async function trackPackage(trackingNumber, carrierHint = null) {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) throw new Error('EASYPOST_API_KEY not configured')

  const carrier = carrierHint || detectCarrier(trackingNumber) || undefined

  const payload = { tracker: { tracking_code: trackingNumber } }
  if (carrier) payload.tracker.carrier = carrier

  const res = await axios.post(`${EASYPOST_BASE}/trackers`, payload, {
    auth:    { username: apiKey, password: '' },
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  })

  const t = res.data
  return {
    tracking_number:    trackingNumber,
    carrier:            t.carrier || carrier || null,
    status:             t.status || 'unknown',
    normalized_status:  EP_STATUS_MAP[t.status] ?? null,
    est_delivery:       t.est_delivery_date
                          ? t.est_delivery_date.split('T')[0]
                          : null,
    signed_by:          t.signed_by || null,
  }
}

// ─── refreshTrackingForTenant — bulk refresh all shipped orders with tracking ─
/**
 * Finds all 'shipped'/'partially_shipped'/'out_for_delivery' orders that have
 * at least one tracking number, queries EasyPost for each unique number, then
 * flips the order status when carrier confirms delivery.
 *
 * @param {string} tenantId
 * @returns {Promise<number>}  count of orders marked delivered
 */
async function refreshTrackingForTenant(tenantId) {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    console.warn('[carrierTracking] EASYPOST_API_KEY not set — skipping tracking refresh')
    return 0
  }

  // Pull all shipped orders that have items with tracking numbers
  const res = await db.query(
    `SELECT DISTINCT
            o.id          AS order_id,
            o.status      AS order_status,
            doi.id        AS item_id,
            doi.tracking_number,
            doi.carrier
       FROM distributor_orders o
       JOIN distributor_order_items doi ON doi.distributor_order_id = o.id
      WHERE o.tenant_id = $1
        AND o.status IN ('shipped','partially_shipped','out_for_delivery')
        AND doi.tracking_number IS NOT NULL
        AND doi.tracking_number <> ''`,
    [tenantId]
  )

  if (!res.rows.length) return 0

  // Dedupe by tracking number — one EasyPost call per unique tracking number
  const seen    = new Map()   // tracking_number → EP result
  let delivered = 0

  for (const row of res.rows) {
    const tn = row.tracking_number
    if (seen.has(tn)) continue

    try {
      const result = await trackPackage(tn, row.carrier)
      seen.set(tn, result)

      if (result.normalized_status === 'delivered') {
        await db.query(
          `UPDATE distributor_orders
              SET status     = 'delivered',
                  status_raw = 'Delivered (carrier confirmed)',
                  updated_at = NOW()
            WHERE id = $1
              AND status IN ('shipped','partially_shipped','out_for_delivery')`,
          [row.order_id]
        )
        delivered++
      } else if (result.normalized_status === 'out_for_delivery') {
        await db.query(
          `UPDATE distributor_orders
              SET status = 'out_for_delivery', updated_at = NOW()
            WHERE id = $1
              AND status IN ('shipped','partially_shipped')`,
          [row.order_id]
        )
      }

      // Persist EasyPost's estimated delivery date back to the item
      if (result.est_delivery) {
        await db.query(
          `UPDATE distributor_order_items
              SET expected_delivery = $1
            WHERE id = $2
              AND (expected_delivery IS NULL OR expected_delivery::date <> $1::date)`,
          [result.est_delivery, row.item_id]
        )
      }

      // Small pause to be polite to the API (free tier has no listed rate limit
      // but 200 ms between calls keeps us well clear of any hidden throttle)
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.warn(`[carrierTracking] failed for ${tn}:`, err.message)
      seen.set(tn, null)
    }
  }

  console.log(`[carrierTracking] tenant ${tenantId}: checked ${seen.size} tracking numbers, ${delivered} orders marked delivered`)
  return delivered
}

// ─── refreshOrder — refresh tracking for a single order ──────────────────────
/**
 * Refreshes all tracking numbers on one order and updates statuses.
 * Returns an array of per-tracking-number results.
 *
 * @param {string} orderId
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
async function refreshOrder(orderId, tenantId) {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) throw new Error('EASYPOST_API_KEY not configured — add it to .env')

  const items = await db.query(
    `SELECT id, tracking_number, carrier
       FROM distributor_order_items
      WHERE distributor_order_id = $1
        AND tracking_number IS NOT NULL AND tracking_number <> ''`,
    [orderId]
  )

  if (!items.rows.length) return []

  // Verify the order belongs to this tenant
  const orderRow = await db.query(
    `SELECT id, status FROM distributor_orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  )
  if (!orderRow.rows.length) throw new Error('Order not found')

  const results = []
  const seen    = new Map()

  for (const item of items.rows) {
    const tn = item.tracking_number
    if (seen.has(tn)) { results.push(seen.get(tn)); continue }

    try {
      const r = await trackPackage(tn, item.carrier)
      seen.set(tn, r)
      results.push(r)

      if (r.normalized_status === 'delivered') {
        await db.query(
          `UPDATE distributor_orders
              SET status     = 'delivered',
                  status_raw = 'Delivered (carrier confirmed)',
                  updated_at = NOW()
            WHERE id = $1
              AND status IN ('shipped','partially_shipped','out_for_delivery')`,
          [orderId]
        )
      } else if (r.normalized_status === 'out_for_delivery') {
        await db.query(
          `UPDATE distributor_orders
              SET status = 'out_for_delivery', updated_at = NOW()
            WHERE id = $1
              AND status IN ('shipped','partially_shipped')`,
          [orderId]
        )
      }

      if (r.est_delivery) {
        await db.query(
          `UPDATE distributor_order_items SET expected_delivery = $1 WHERE id = $2`,
          [r.est_delivery, item.id]
        )
      }
    } catch (err) {
      const errResult = { tracking_number: tn, error: err.message }
      seen.set(tn, errResult)
      results.push(errResult)
    }
  }

  return results
}

module.exports = { trackPackage, refreshTrackingForTenant, refreshOrder, detectCarrier }
