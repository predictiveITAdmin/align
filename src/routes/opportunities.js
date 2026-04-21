/**
 * /api/opportunities — Autotask Opportunities + Quotes + Quote Items
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const opportunitiesSync = require('../services/opportunitiesSync')

// ─── GET /api/opportunities — list with filters ──────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { client_id, stage, search } = req.query
  try {
    let q = `
      SELECT o.*, c.name AS client_name,
             (SELECT count(*) FROM quotes WHERE opportunity_id = o.id) AS quote_count,
             (SELECT count(*) FROM distributor_orders WHERE opportunity_id = o.id) AS order_count
      FROM opportunities o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); q += ` AND o.client_id = $${params.length}` }
    if (stage) { params.push(stage); q += ` AND o.stage = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (o.title ILIKE $${params.length}
                  OR EXISTS (SELECT 1 FROM unnest(o.po_numbers) p WHERE p ILIKE $${params.length}))`
    }
    q += ` ORDER BY o.created_date DESC NULLS LAST LIMIT 500`

    const r = await db.query(q, params)
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[opportunities] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch opportunities' })
  }
})

// ─── GET /api/opportunities/:id — detail + quotes + items + orders ───────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const opp = await db.query(
      `SELECT o.*, c.name AS client_name
       FROM opportunities o
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!opp.rows.length) return res.status(404).json({ error: 'Opportunity not found' })

    const quotes = await db.query(
      `SELECT * FROM quotes WHERE opportunity_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    )
    const quoteIds = quotes.rows.map(q => q.id)
    const items = quoteIds.length
      ? await db.query(`SELECT * FROM quote_items WHERE quote_id = ANY($1)`, [quoteIds])
      : { rows: [] }

    const itemsByQuote = {}
    for (const i of items.rows) {
      if (!itemsByQuote[i.quote_id]) itemsByQuote[i.quote_id] = []
      itemsByQuote[i.quote_id].push(i)
    }
    const quotesWithItems = quotes.rows.map(q => ({ ...q, items: itemsByQuote[q.id] || [] }))

    // Linked distributor orders
    const orders = await db.query(
      `SELECT * FROM distributor_orders WHERE opportunity_id = $1 ORDER BY order_date DESC NULLS LAST`,
      [req.params.id]
    )

    res.json({
      data: {
        ...opp.rows[0],
        quotes: quotesWithItems,
        orders: orders.rows,
      }
    })
  } catch (err) {
    console.error('[opportunities] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch opportunity' })
  }
})

// ─── POST /api/opportunities/sync — trigger sync (admin only) ────────────────
router.post('/sync', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    // Run async — return quickly, let the sync run in background
    opportunitiesSync.syncAll(req.tenant.id)
      .then(result => console.log('[opportunities] sync done', result))
      .catch(err => console.error('[opportunities] sync failed:', err.message))

    res.json({ status: 'started', message: 'Sync running in background' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to start sync' })
  }
})

// ─── GET /api/opportunities/sync/status — recent sync stats ─────────────────
router.get('/sync/status', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        (SELECT count(*) FROM opportunities WHERE tenant_id = $1) AS opp_count,
        (SELECT count(*) FROM quotes q JOIN opportunities o ON o.id = q.opportunity_id WHERE o.tenant_id = $1) AS quote_count,
        (SELECT count(*) FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id JOIN opportunities o ON o.id = q.opportunity_id WHERE o.tenant_id = $1) AS item_count,
        (SELECT MAX(last_synced_at) FROM opportunities WHERE tenant_id = $1) AS last_opp_sync,
        (SELECT count(*) FROM opportunities WHERE tenant_id = $1 AND array_length(po_numbers, 1) > 0) AS opps_with_po
    `, [req.tenant.id])
    res.json({ data: r.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
