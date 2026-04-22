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
  const { client_id, stage, status, search, include_unlinked, include_closed } = req.query
  try {
    let q = `
      SELECT o.*, c.name AS client_name,
             (SELECT count(*) FROM quotes WHERE opportunity_id = o.id) AS quote_count,
             (SELECT count(*) FROM distributor_orders WHERE opportunity_id = o.id) AS order_count
      FROM opportunities o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.tenant_id = $1`
    const params = [req.tenant.id]

    // By default, only show opportunities linked to a client (exclude orphaned inactive-account opps)
    if (!include_unlinked) {
      q += ` AND o.client_id IS NOT NULL`
    }

    // By default, hide Closed/Lost from the global list unless explicitly requested
    // (client detail tab passes include_closed=1 to show full history)
    if (!include_closed && !status && !client_id) {
      q += ` AND o.status NOT IN ('Lost', 'Not Ready To Buy')`
    }

    if (client_id) { params.push(client_id); q += ` AND o.client_id = $${params.length}` }
    if (stage)     { params.push(stage);     q += ` AND o.stage = $${params.length}` }
    if (status)    { params.push(status);    q += ` AND o.status = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      q += ` AND (o.title ILIKE $${params.length}
                  OR c.name ILIKE $${params.length}
                  OR EXISTS (SELECT 1 FROM unnest(o.po_numbers) p WHERE p ILIKE $${params.length}))`
    }
    q += ` ORDER BY o.created_date DESC NULLS LAST LIMIT 2000`

    const r = await db.query(q, params)
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[opportunities] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch opportunities' })
  }
})

// NOTE: All specific routes must be defined BEFORE /:id to avoid param capture.

// ─── GET /api/opportunities/client-quotes — all quotes for a client ──────────
router.get('/client-quotes', requireAuth, async (req, res) => {
  const { client_id } = req.query
  if (!client_id) return res.status(400).json({ error: 'client_id required' })
  try {
    const r = await db.query(`
      SELECT q.*,
             o.title  AS opportunity_title,
             o.stage  AS opportunity_stage,
             o.po_numbers,
             c.name   AS client_name,
             (SELECT count(*) FROM quote_items WHERE quote_id = q.id) AS item_count
      FROM quotes q
      JOIN opportunities o ON o.id = q.opportunity_id
      JOIN clients c       ON c.id = o.client_id
      WHERE o.tenant_id = $1 AND o.client_id = $2
      ORDER BY q.created_at DESC`,
      [req.tenant.id, client_id]
    )
    res.json({ data: r.rows, total: r.rowCount })
  } catch (err) {
    console.error('[opportunities] client-quotes error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/opportunities/quote/:quoteId — single quote + items ────────────
router.get('/quote/:quoteId', requireAuth, async (req, res) => {
  try {
    const quoteRes = await db.query(
      `SELECT q.*, o.title AS opportunity_title, o.tenant_id
       FROM quotes q
       JOIN opportunities o ON o.id = q.opportunity_id
       WHERE q.id = $1 AND o.tenant_id = $2`,
      [req.params.quoteId, req.tenant.id]
    )
    if (!quoteRes.rows.length) return res.status(404).json({ error: 'Quote not found' })

    const items = await db.query(
      `SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY id`,
      [req.params.quoteId]
    )
    res.json({ data: { ...quoteRes.rows[0], items: items.rows } })
  } catch (err) {
    console.error('[opportunities] quote detail error:', err.message)
    res.status(500).json({ error: err.message })
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
        (SELECT count(*) FROM opportunities WHERE tenant_id = $1 AND client_id IS NOT NULL) AS opps_with_client,
        (SELECT count(*) FROM quotes q JOIN opportunities o ON o.id = q.opportunity_id WHERE o.tenant_id = $1) AS quote_count,
        (SELECT count(*) FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id JOIN opportunities o ON o.id = q.opportunity_id WHERE o.tenant_id = $1) AS item_count,
        (SELECT MAX(last_synced_at) FROM opportunities WHERE tenant_id = $1) AS last_opp_sync,
        (SELECT count(*) FROM opportunities WHERE tenant_id = $1 AND array_length(po_numbers, 1) > 0) AS opps_with_po,
        (SELECT count(*) FROM opportunities WHERE tenant_id = $1 AND status IN ('Closed','Implemented') AND array_length(po_numbers, 1) > 0) AS closed_won_with_po
    `, [req.tenant.id])

    // Distinct statuses and stages for the admin panel pickers
    const [stages, statuses] = await Promise.all([
      db.query(`SELECT DISTINCT stage FROM opportunities WHERE tenant_id = $1 AND stage IS NOT NULL ORDER BY stage`, [req.tenant.id]),
      db.query(`SELECT DISTINCT status, count(*) AS cnt FROM opportunities WHERE tenant_id = $1 AND status IS NOT NULL GROUP BY status ORDER BY cnt DESC`, [req.tenant.id]),
    ])
    res.json({ data: {
      ...r.rows[0],
      stages:   stages.rows.map(s => s.stage),
      statuses: statuses.rows,
    }})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// All valid Autotask opportunity status labels (for admin UI)
const AT_STATUS_OPTIONS = ['Active', 'Not Ready To Buy', 'Lost', 'Closed', 'Implemented']
// Default: only exclude 'Not Ready To Buy' (pre-prospect records, no pipeline value).
// 'Lost' is intentionally NOT excluded — full client deal history must be available.
// 'Closed'/'Implemented' are never excluded — they have POs needed for order matching.
// Stage-66 (Junk/Spam) is a hardcoded exclusion in the sync service (not configurable).
const DEFAULT_EXCLUDE_STATUSES = ['Not Ready To Buy']

// ─── GET /api/opportunities/sync-settings — load sync filter config ──────────
router.get('/sync-settings', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT settings->'opportunity_sync' AS cfg FROM tenant_settings WHERE tenant_id = $1`,
      [req.tenant.id]
    )
    const defaults = {
      active_clients_only: true,
      min_create_date:     null,
      exclude_statuses:    DEFAULT_EXCLUDE_STATUSES,
    }
    res.json({ data: r.rows[0]?.cfg || defaults, status_options: AT_STATUS_OPTIONS })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PUT /api/opportunities/sync-settings — save sync filter config ───────────
router.put('/sync-settings', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { active_clients_only, min_create_date, exclude_statuses } = req.body
  try {
    const cfg = {
      active_clients_only: active_clients_only !== false,
      min_create_date:     min_create_date || null,
      exclude_statuses:    Array.isArray(exclude_statuses) ? exclude_statuses : DEFAULT_EXCLUDE_STATUSES,
    }
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, settings)
      VALUES ($1, jsonb_build_object('opportunity_sync', $2::jsonb))
      ON CONFLICT (tenant_id) DO UPDATE
        SET settings = tenant_settings.settings || jsonb_build_object('opportunity_sync', $2::jsonb),
            updated_at = NOW()
    `, [req.tenant.id, JSON.stringify(cfg)])
    res.json({ data: cfg, status_options: AT_STATUS_OPTIONS })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/opportunities/:id — detail + quotes + items + orders ───────────
// MUST BE LAST — generic param route captures anything not matched above
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

module.exports = router
