/**
 * GET /api/search?q={query}
 * Global app search — clients, opps, quotes, orders, recs, assets
 * Returns max 5 results per entity type, grouped.
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

router.get('/', requireAuth, async (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) {
    return res.json({ opportunities: [], clients: [], quotes: [], orders: [], recs: [], assets: [], total: 0 })
  }

  const tid  = req.tenant.id
  const like = `%${q.trim()}%`

  try {
    const [clients, opps, quotes, orders, recs, assets] = await Promise.all([
      db.query(`
        SELECT id, name, autotask_company_id
        FROM clients
        WHERE tenant_id = $1 AND name ILIKE $2
        ORDER BY name LIMIT 5
      `, [tid, like]),

      db.query(`
        SELECT o.id, o.title, o.status, o.stage, o.amount, o.po_numbers,
               o.assigned_resource_name, o.client_id, c.name AS client_name,
               COALESCE(
                 json_agg(DISTINCT jsonb_build_object(
                   'id', q2.id, 'quote_number', q2.quote_number,
                   'title', q2.title, 'amount', q2.amount, 'status', q2.status
                 )) FILTER (WHERE q2.id IS NOT NULL),
                 '[]'::json
               ) AS quotes,
               COALESCE(
                 json_agg(DISTINCT jsonb_build_object(
                   'id', ord.id, 'distributor_order_id', ord.distributor_order_id,
                   'distributor', ord.distributor, 'status', ord.status, 'total', ord.total
                 )) FILTER (WHERE ord.id IS NOT NULL),
                 '[]'::json
               ) AS orders
        FROM opportunities o
        LEFT JOIN clients c ON c.id = o.client_id
        LEFT JOIN quotes q2 ON q2.opportunity_id = o.id
        LEFT JOIN distributor_orders ord ON ord.opportunity_id = o.id
        WHERE o.tenant_id = $1 AND (
          o.title ILIKE $2
          OR EXISTS (SELECT 1 FROM unnest(o.po_numbers) p WHERE p ILIKE $2)
          OR o.category ILIKE $2
        )
        GROUP BY o.id, c.name
        ORDER BY o.created_date DESC NULLS LAST
        LIMIT 5
      `, [tid, like]),

      db.query(`
        SELECT q2.id, q2.quote_number, q2.title, q2.amount, q2.status,
               q2.opportunity_id, o.title AS opportunity_title,
               o.client_id, c.name AS client_name
        FROM quotes q2
        JOIN opportunities o ON o.id = q2.opportunity_id
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1 AND (q2.title ILIKE $2 OR q2.quote_number::text ILIKE $2)
        ORDER BY q2.created_at DESC NULLS LAST
        LIMIT 5
      `, [tid, like]),

      db.query(`
        SELECT ord.id, ord.distributor_order_id, ord.distributor,
               ord.po_number, ord.status, ord.total, ord.order_date,
               ord.client_id, c.name AS client_name,
               opp.id AS opportunity_id, opp.title AS opportunity_title
        FROM distributor_orders ord
        LEFT JOIN clients c ON c.id = ord.client_id
        LEFT JOIN opportunities opp ON opp.id = ord.opportunity_id
        WHERE ord.tenant_id = $1 AND (
          ord.distributor_order_id ILIKE $2
          OR ord.po_number ILIKE $2
          OR ord.ship_to_name ILIKE $2
        )
        ORDER BY ord.order_date DESC NULLS LAST
        LIMIT 5
      `, [tid, like]),

      db.query(`
        SELECT r.id, r.title, r.priority, r.status,
               r.client_id, c.name AS client_name
        FROM recommendations r
        LEFT JOIN clients c ON c.id = r.client_id
        WHERE r.tenant_id = $1 AND (r.title ILIKE $2 OR r.description ILIKE $2)
        ORDER BY r.created_at DESC NULLS LAST
        LIMIT 5
      `, [tid, like]),

      db.query(`
        SELECT a.id, a.name, a.serial_number, a.model, a.manufacturer,
               a.client_id, c.name AS client_name
        FROM assets a
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE a.tenant_id = $1 AND a.is_active = true
          AND (a.name ILIKE $2 OR a.serial_number ILIKE $2 OR a.model ILIKE $2)
        ORDER BY a.name
        LIMIT 5
      `, [tid, like]),
    ])

    const total = clients.rowCount + opps.rowCount + quotes.rowCount +
                  orders.rowCount + recs.rowCount + assets.rowCount

    res.json({
      clients:       clients.rows,
      opportunities: opps.rows,
      quotes:        quotes.rows,
      orders:        orders.rows,
      recs:          recs.rows,
      assets:        assets.rows,
      total,
    })
  } catch (err) {
    console.error('[search] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
