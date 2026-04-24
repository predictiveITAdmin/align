/**
 * /api/orders — Distributor orders: list, detail, PO mapping
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const opportunitiesSync = require('../services/opportunitiesSync')
const { matchAllUnmatched, getMatchSuggestions, INTERNAL_SKU_REGEX } = require('../services/orderMatcher')
const { syncAllSuppliers, inferDeliveries } = require('../services/distributorSync')
const { refreshTrackingForTenant, refreshOrder } = require('../services/carrierTracking')
const { linkSerialsForOrder } = require('../services/serialAssetLinker')

// Open-order statuses — everything that hasn't reached delivered/cancelled
const OPEN_ORDER_STATUSES = ['submitted','confirmed','partially_shipped','shipped','backordered','out_for_delivery','exception']

// ─── GET /api/orders — list with filters ─────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  // open_only=1 (default) → show only non-delivered + non-recurring orders
  //   pass open_only=0 for all orders
  //   pass recurring=only for just subscription/license renewals
  //   pass recurring=include to mix them in with open orders
  const { distributor, status, client_id, match_status, search,
          from_date, to_date, open_only, recurring, limit = 500 } = req.query
  try {
    let q = `
      SELECT o.*,
             c.name AS client_name,
             opp.title AS opportunity_title,
             opp.category AS opportunity_category,
             opp.autotask_opportunity_id AS autotask_opportunity_id,
             qu.quote_number,
             (SELECT json_agg(row_to_json(i)) FROM (
               SELECT id, mfg_part_number, manufacturer, description,
                      quantity_ordered, quantity_shipped, quantity_backordered,
                      quantity_cancelled, tracking_number, carrier, ship_date,
                      expected_delivery
                 FROM distributor_order_items
                 WHERE distributor_order_id = o.id
             ) i) AS items
      FROM distributor_orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN opportunities opp ON opp.id = o.opportunity_id
      LEFT JOIN quotes qu ON qu.id = o.quote_id
      WHERE o.tenant_id = $1`
    const params = [req.tenant.id]

    // Default: orders from 2021-01-01 onward unless caller specifies from_date
    const effectiveFrom = from_date || '2021-01-01'
    params.push(effectiveFrom); q += ` AND (o.order_date >= $${params.length} OR o.order_date IS NULL)`

    if (distributor)  { params.push(distributor);  q += ` AND o.distributor = $${params.length}` }
    if (client_id)    { params.push(client_id);    q += ` AND o.client_id = $${params.length}` }
    if (match_status) { params.push(match_status); q += ` AND o.match_status = $${params.length}` }
    if (to_date)      { params.push(to_date);      q += ` AND o.order_date <= $${params.length}` }

    // Status: explicit status filter overrides open_only
    if (status === 'in_transit') {
      q += ` AND o.status IN ('shipped','partially_shipped')`
    } else if (status) {
      params.push(status); q += ` AND o.status = $${params.length}`
    } else if (open_only !== '0') {
      // Default view: open orders only (exclude delivered + cancelled)
      q += ` AND o.status NOT IN ('delivered','cancelled')`
    }

    // Recurring filter: by default, hide license/SaaS renewals from the list.
    // recurring=only    → show ONLY recurring orders
    // recurring=include → show both recurring + non-recurring
    if (recurring === 'only') {
      q += ` AND o.is_recurring = true`
    } else if (recurring !== 'include') {
      q += ` AND o.is_recurring = false`
    }

    if (search) {
      params.push(`%${search}%`)
      q += ` AND (o.po_number ILIKE $${params.length}
                  OR o.distributor_order_id ILIKE $${params.length}
                  OR o.ship_to_name ILIKE $${params.length}
                  OR opp.title ILIKE $${params.length}
                  OR qu.quote_number ILIKE $${params.length})`
    }

    q += ` ORDER BY o.order_date DESC NULLS LAST LIMIT $${params.length + 1}`
    params.push(parseInt(limit))

    const r = await db.query(q, params)
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[orders] list error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/orders/stats — counts for dashboard tiles ─────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    // "open" excludes recurring renewals — those are invoices for subscriptions,
    // not deliveries to track. Counted separately as "recurring".
    const r = await db.query(`
      SELECT
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1) AS total,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND match_status = 'unmapped' AND is_recurring = false) AS unmapped,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND match_status = 'needs_review' AND is_recurring = false) AS needs_review,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status NOT IN ('delivered','cancelled','returned') AND is_recurring = false) AS open,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status IN ('shipped','partially_shipped') AND is_recurring = false) AS in_transit,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status = 'backordered' AND is_recurring = false) AS backordered,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status = 'delivered' AND is_recurring = false) AS delivered_total,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND is_recurring = true) AS recurring
    `, [req.tenant.id])
    res.json({ data: r.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/orders/:id — detail with items + events ────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await db.query(
      `SELECT o.*, c.name AS client_name, opp.title AS opportunity_title,
              opp.autotask_opportunity_id, qu.quote_number
       FROM distributor_orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN opportunities opp ON opp.id = o.opportunity_id
       LEFT JOIN quotes qu ON qu.id = o.quote_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!order.rows.length) return res.status(404).json({ error: 'Order not found' })

    const items = await db.query(
      `SELECT * FROM distributor_order_items WHERE distributor_order_id = $1 ORDER BY created_at`,
      [req.params.id]
    )
    const events = await db.query(
      `SELECT * FROM order_events WHERE distributor_order_id = $1 ORDER BY event_date DESC`,
      [req.params.id]
    )

    res.json({ data: { ...order.rows[0], items: items.rows, events: events.rows } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/:id/map — manually link to Opportunity + writeback PO ─
router.post('/:id/map', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  const { opportunity_id, quote_id } = req.body
  if (!opportunity_id) return res.status(400).json({ error: 'opportunity_id required' })

  try {
    // Load order
    const or = await db.query(
      `SELECT * FROM distributor_orders WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!or.rows.length) return res.status(404).json({ error: 'Order not found' })
    const order = or.rows[0]
    if (!order.po_number) return res.status(400).json({ error: 'Order has no PO number to map' })

    // Load opportunity
    const opp = await db.query(
      `SELECT id, client_id, po_numbers FROM opportunities WHERE id = $1 AND tenant_id = $2`,
      [opportunity_id, req.tenant.id]
    )
    if (!opp.rows.length) return res.status(404).json({ error: 'Opportunity not found' })

    // Append PO to Autotask Opp (ADR-003: stored as array, comma-serialized on write)
    try {
      await opportunitiesSync.appendPoToAutotask(opportunity_id, order.po_number)
    } catch (atErr) {
      console.error('[orders] AT writeback failed:', atErr.message)
      // Continue with local mapping even if AT writeback fails — user can retry
    }

    // Update the order with the linkage
    await db.query(
      `UPDATE distributor_orders
       SET opportunity_id = $1, quote_id = $2, client_id = $3,
           match_status = 'matched', match_method = 'manual', match_confidence = 100,
           matched_at = NOW(), matched_by = $4
       WHERE id = $5`,
      [opportunity_id, quote_id || null, opp.rows[0].client_id, req.user.sub, req.params.id]
    )

    // Log event
    await db.query(
      `INSERT INTO order_events (distributor_order_id, event_type, description, actor, metadata)
       VALUES ($1, 'po_mapped', $2, $3, $4)`,
      [req.params.id,
       `Mapped to opportunity ${opportunity_id} (PO ${order.po_number})`,
       req.user.sub,
       JSON.stringify({ opportunity_id, quote_id, po: order.po_number })]
    )

    // Add AT note documenting the manual mapping
    if (order.po_number) {
      opportunitiesSync.createOpportunityNote(
        opportunity_id,
        'Order manually linked via Align',
        [
          `Distributor order ${order.distributor_order_id || req.params.id} was manually linked to this opportunity via predictiveIT Align.`,
          `PO Number: ${order.po_number}`,
          `Linked by user: ${req.user.sub}`,
        ].join('\n')
      ).catch(err => console.warn('[orders] AT note failed (non-fatal):', err.message))
    }

    res.json({ status: 'ok' })
  } catch (err) {
    console.error('[orders] map error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/:id/mark-delivered — manually mark a shipped order as delivered ──
router.post('/:id/mark-delivered', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE distributor_orders
          SET status = 'delivered', status_raw = 'Delivered (manual)', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
          AND status IN ('shipped','partially_shipped','out_for_delivery')
        RETURNING id, status`,
      [req.params.id, req.tenant.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Order not found or not in a shipped state' })
    res.json({ ok: true, status: r.rows[0].status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/infer-deliveries — date-based delivery inference for all shipped orders ──
router.post('/infer-deliveries', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    const updated = await inferDeliveries(req.tenant.id)
    res.json({ ok: true, updated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/refresh-tracking — bulk EasyPost tracking refresh ──────
router.post('/refresh-tracking', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    const delivered = await refreshTrackingForTenant(req.tenant.id)
    res.json({ ok: true, delivered })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/:id/link-assets — try to link serials to existing assets ──
router.post('/:id/link-assets', requireAuth, async (req, res) => {
  try {
    const result = await linkSerialsForOrder(req.params.id, req.tenant.id)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/:id/refresh-tracking — refresh tracking for one order ──
router.post('/:id/refresh-tracking', requireAuth, async (req, res) => {
  try {
    const results = await refreshOrder(req.params.id, req.tenant.id)
    res.json({ ok: true, results })
  } catch (err) {
    res.status(err.message === 'Order not found' ? 404 : 500).json({ error: err.message })
  }
})

// ─── GET /api/orders/:id/match-suggestions — top candidate Opportunities ─────
router.get('/:id/match-suggestions', requireAuth, async (req, res) => {
  const { q } = req.query
  try {
    const suggestions = await getMatchSuggestions(req.tenant.id, req.params.id, q || null)
    res.json({ data: suggestions })
  } catch (err) {
    console.error('[orders] match-suggestions error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/match-all — run matcher across all unmapped orders ─────
router.post('/match-all', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  try {
    const result = await matchAllUnmatched(req.tenant.id)
    res.json({ status: 'ok', ...result })
  } catch (err) {
    console.error('[orders] match-all error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/sync — trigger distributor API pull for this tenant ────
router.post('/sync', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    const result = await syncAllSuppliers(req.tenant.id)
    res.json({ status: 'ok', ...result })
  } catch (err) {
    console.error('[orders] sync error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/:id/unmap — remove linkage ────────────────────────────
router.post('/:id/unmap', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  try {
    await db.query(
      `UPDATE distributor_orders
       SET opportunity_id = NULL, quote_id = NULL, client_id = NULL,
           match_status = 'unmapped', match_method = NULL, match_confidence = NULL,
           matched_at = NULL, matched_by = NULL
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    await db.query(
      `INSERT INTO order_events (distributor_order_id, event_type, description, actor)
       VALUES ($1, 'po_mapped', 'Mapping removed', $2)`,
      [req.params.id, req.user.sub]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/orders/qa/pos-not-written ──────────────────────────────────────
// Orders that were auto-mapped to an opportunity but whose PO number was NEVER
// written into the opp's po_numbers[] array. These need manual intervention to
// keep Autotask in sync (the auto-matcher only writes PO for confidence=100
// po_exact matches; part_overlap / client_name / po_fuzzy matches don't).
router.get('/qa/pos-not-written', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT o.id, o.distributor, o.distributor_order_id, o.po_number, o.order_date,
             o.match_method, o.match_confidence, o.match_status, o.matched_at,
             o.total, o.subtotal,
             c.name AS client_name,
             opp.id AS opportunity_id, opp.title AS opportunity_title,
             opp.autotask_opportunity_id, opp.po_numbers AS opp_po_numbers
        FROM distributor_orders o
        JOIN opportunities opp ON opp.id = o.opportunity_id
        LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.tenant_id = $1
         AND o.po_number IS NOT NULL AND o.po_number <> ''
         AND o.match_method IS NOT NULL
         AND o.match_method NOT IN ('manual')
         AND (opp.po_numbers IS NULL OR NOT (o.po_number = ANY(opp.po_numbers)))
       ORDER BY o.matched_at DESC NULLS LAST, o.order_date DESC NULLS LAST
       LIMIT 500
    `, [req.tenant.id])
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[orders] qa/pos-not-written error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/orders/qa/multi-distributor ────────────────────────────────────
// Opportunities that have orders from 2+ distinct distributors. Useful for QA
// because reconciliation (expected cost from quote vs actual from distributor)
// needs to aggregate across all distributor orders for the same opp.
// Also filters out service/shipping SKUs on the quote side for the expected total.
router.get('/qa/multi-distributor', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      WITH opp_summary AS (
        SELECT o.opportunity_id,
               COUNT(DISTINCT o.distributor)            AS distributor_count,
               ARRAY_AGG(DISTINCT o.distributor)        AS distributors,
               COUNT(DISTINCT o.id)                     AS order_count,
               SUM(COALESCE(o.total, o.subtotal, 0))    AS actual_total_orders,
               MIN(o.order_date)                         AS first_order_date,
               MAX(o.order_date)                         AS last_order_date
          FROM distributor_orders o
         WHERE o.tenant_id = $1
           AND o.opportunity_id IS NOT NULL
           AND o.is_recurring = false
         GROUP BY o.opportunity_id
        HAVING COUNT(DISTINCT o.distributor) >= 2
      ),
      quote_expected AS (
        -- Expected cost from quotes, EXCLUDING internal service/shipping SKUs
        SELECT q.opportunity_id,
               SUM(CASE
                 WHEN qi.description IS NULL OR LOWER(TRIM(qi.description)) !~ $2
                 THEN COALESCE(qi.unit_cost, 0) * COALESCE(qi.quantity, 0)
                 ELSE 0 END) AS expected_product_cost,
               SUM(CASE
                 WHEN qi.description IS NOT NULL AND LOWER(TRIM(qi.description)) ~ $2
                 THEN COALESCE(qi.unit_price, 0) * COALESCE(qi.quantity, 0)
                 ELSE 0 END) AS service_revenue_excluded,
               COUNT(DISTINCT CASE
                 WHEN qi.description IS NULL OR LOWER(TRIM(qi.description)) !~ $2
                 THEN qi.id END) AS product_line_count
          FROM quotes q
          JOIN quote_items qi ON qi.quote_id = q.id
         WHERE q.tenant_id = $1
         GROUP BY q.opportunity_id
      )
      SELECT os.*,
             opp.title AS opportunity_title,
             opp.autotask_opportunity_id,
             opp.amount AS opp_amount,
             c.name    AS client_name,
             qe.expected_product_cost,
             qe.service_revenue_excluded,
             qe.product_line_count,
             (COALESCE(os.actual_total_orders, 0) - COALESCE(qe.expected_product_cost, 0)) AS variance
        FROM opp_summary os
        JOIN opportunities opp ON opp.id = os.opportunity_id
        LEFT JOIN clients c ON c.id = opp.client_id
        LEFT JOIN quote_expected qe ON qe.opportunity_id = os.opportunity_id
       ORDER BY os.last_order_date DESC NULLS LAST
       LIMIT 200
    `, [req.tenant.id, INTERNAL_SKU_REGEX])
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[orders] qa/multi-distributor error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/orders/qa/stats ────────────────────────────────────────────────
// Summary counts for QA widgets on the Orders page.
router.get('/qa/stats', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        (SELECT count(*) FROM distributor_orders o
           JOIN opportunities opp ON opp.id = o.opportunity_id
          WHERE o.tenant_id = $1
            AND o.po_number IS NOT NULL AND o.po_number <> ''
            AND o.match_method IS NOT NULL AND o.match_method NOT IN ('manual')
            AND (opp.po_numbers IS NULL OR NOT (o.po_number = ANY(opp.po_numbers)))
        )::int AS pos_not_written,
        (SELECT count(*) FROM (
          SELECT opportunity_id FROM distributor_orders
           WHERE tenant_id = $1 AND opportunity_id IS NOT NULL AND is_recurring = false
           GROUP BY opportunity_id
          HAVING count(DISTINCT distributor) >= 2
        ) t)::int AS multi_distributor_opps
    `, [req.tenant.id])
    res.json({ data: r.rows[0] })
  } catch (err) {
    console.error('[orders] qa/stats error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/orders/qa/write-po/:id — force PO writeback for auto-mapped order ─
// Used by the QA widget's "Fix" action: pushes the order's PO into the opp's
// Autotask po_numbers UDF.
router.post('/qa/write-po/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  try {
    const or = await db.query(
      `SELECT o.id, o.po_number, o.opportunity_id, o.distributor, o.distributor_order_id
         FROM distributor_orders o
        WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!or.rows.length) return res.status(404).json({ error: 'Order not found' })
    const order = or.rows[0]
    if (!order.po_number) return res.status(400).json({ error: 'Order has no PO number' })
    if (!order.opportunity_id) return res.status(400).json({ error: 'Order not linked to an opportunity' })

    await opportunitiesSync.appendPoToAutotask(order.opportunity_id, order.po_number)

    await db.query(
      `INSERT INTO order_events (distributor_order_id, event_type, description, actor, metadata)
       VALUES ($1, 'po_mapped', $2, $3, $4)`,
      [order.id, `PO writeback (manual fix via QA widget)`, req.user.sub,
       JSON.stringify({ po: order.po_number, opportunity_id: order.opportunity_id })]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('[orders] qa/write-po error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
