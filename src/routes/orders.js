/**
 * /api/orders — Distributor orders: list, detail, PO mapping
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const opportunitiesSync = require('../services/opportunitiesSync')
const { matchAllUnmatched, getMatchSuggestions } = require('../services/orderMatcher')
const { syncAllSuppliers } = require('../services/distributorSync')

// Open-order statuses — everything that hasn't reached delivered/cancelled
const OPEN_ORDER_STATUSES = ['submitted','confirmed','partially_shipped','shipped','backordered','out_for_delivery','exception']

// ─── GET /api/orders — list with filters ─────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  // open_only=1 (default) → show only non-delivered orders; pass open_only=0 for all
  const { distributor, status, client_id, match_status, search,
          from_date, to_date, open_only, limit = 500 } = req.query
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
    if (status) {
      params.push(status); q += ` AND o.status = $${params.length}`
    } else if (open_only !== '0') {
      // Default view: open orders only (exclude delivered + cancelled)
      q += ` AND o.status NOT IN ('delivered','cancelled')`
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
    const r = await db.query(`
      SELECT
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1) AS total,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND match_status = 'unmapped') AS unmapped,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND match_status = 'needs_review') AS needs_review,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status IN ('submitted','confirmed','partially_shipped','shipped','out_for_delivery')) AS open,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status = 'backordered') AS backordered,
        (SELECT count(*) FROM distributor_orders WHERE tenant_id = $1 AND status = 'delivered') AS delivered_total
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

    res.json({ status: 'ok' })
  } catch (err) {
    console.error('[orders] map error:', err.message)
    res.status(500).json({ error: err.message })
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

module.exports = router
