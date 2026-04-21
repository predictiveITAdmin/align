const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const atApi = require('../services/autotaskApiService')

// GET /api/recommendations
router.get('/', requireAuth, async (req, res) => {
  const { client_id, status, priority, initiative_id, assessment_id, year, kind } = req.query
  try {
    let query = `
      SELECT r.*,
             c.name AS client_name,
             u.display_name AS assigned_to_name,
             (SELECT COUNT(*) FROM recommendation_assets ra WHERE ra.recommendation_id = r.id) AS asset_count,
             (SELECT COALESCE(SUM(amount),0) FROM recommendation_budget_items rbi WHERE rbi.recommendation_id = r.id AND rbi.fee_type = 'one_time') AS budget_one_time,
             (SELECT COALESCE(SUM(amount),0) FROM recommendation_budget_items rbi WHERE rbi.recommendation_id = r.id AND rbi.fee_type != 'one_time') AS budget_recurring,
             (SELECT COALESCE(json_agg(json_build_object(
               'description', rbi.description,
               'amount', rbi.amount,
               'fee_type', rbi.fee_type,
               'billing_type', rbi.billing_type
             ) ORDER BY rbi.sort_order, rbi.created_at), '[]'::json)
              FROM recommendation_budget_items rbi WHERE rbi.recommendation_id = r.id) AS budget_line_items
      FROM recommendations r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id)     { params.push(client_id);     query += ` AND r.client_id = $${params.length}` }
    if (status)        { params.push(status);        query += ` AND r.status = $${params.length}` }
    if (priority)      { params.push(priority);      query += ` AND r.priority = $${params.length}` }
    if (kind)          { params.push(kind);          query += ` AND COALESCE(r.kind,'recommendation') = $${params.length}` }
    if (year)          { params.push(parseInt(year)); query += ` AND (r.schedule_year = $${params.length} OR r.schedule_year IS NULL)` }
    if (initiative_id) {
      params.push(initiative_id)
      query += ` AND r.id IN (SELECT recommendation_id FROM initiative_recommendations WHERE initiative_id = $${params.length})`
    }
    if (assessment_id) {
      params.push(assessment_id)
      query += ` AND r.id IN (SELECT DISTINCT r2.id FROM recommendations r2 LEFT JOIN assessment_answers aa ON aa.id = r2.assessment_answer_id LEFT JOIN template_items ti ON ti.id = aa.item_id LEFT JOIN template_sections ts ON ts.id = ti.section_id LEFT JOIN assessment_templates at2 ON at2.id = ts.template_id WHERE aa.assessment_id = $${params.length})`
    }
    query += ` ORDER BY CASE r.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END, r.created_at DESC`
    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[recommendations] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch recommendations' })
  }
})

// GET /api/recommendations/action-items?client_id= — all action items for a client
router.get('/action-items', requireAuth, async (req, res) => {
  const { client_id } = req.query
  try {
    let query = `
      SELECT ai.*,
             u.display_name AS assigned_to_name,
             r.title  AS recommendation_title,
             r.id     AS recommendation_id,
             r.at_ticket_number AS rec_at_ticket_number,
             r.at_ticket_id,
             r.client_id,
             c.name   AS client_name
      FROM recommendation_action_items ai
      LEFT JOIN users u ON u.id = ai.assigned_to
      JOIN recommendations r ON r.id = ai.recommendation_id
      JOIN clients c ON c.id = r.client_id
      WHERE r.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND r.client_id = $${params.length}` }
    query += ` ORDER BY ai.completed ASC, ai.created_at DESC`
    const result = await db.query(query, params)
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[action-items] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch action items' })
  }
})

// GET /api/recommendations/:id — with linked assets + budget items
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, c.name AS client_name, u.display_name AS assigned_to_name,
              c.autotask_company_id
       FROM recommendations r
       JOIN clients c ON c.id = r.client_id
       LEFT JOIN users u ON u.id = r.assigned_to
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })

    const [assets, budgetItems, actionItems] = await Promise.all([
      db.query(
        `SELECT ra.id AS link_id, ra.notes AS link_notes, a.id, a.name, a.manufacturer, a.model,
                a.serial_number, a.warranty_expiry, a.purchase_date, a.eol_date, at2.name AS asset_type,
                at2.default_lifecycle_years
         FROM recommendation_assets ra
         JOIN assets a ON a.id = ra.asset_id
         LEFT JOIN asset_types at2 ON at2.id = a.asset_type_id
         WHERE ra.recommendation_id = $1
         ORDER BY a.name`,
        [req.params.id]
      ),
      db.query(
        `SELECT * FROM recommendation_budget_items WHERE recommendation_id = $1 ORDER BY sort_order, created_at`,
        [req.params.id]
      ),
      db.query(
        `SELECT * FROM recommendation_action_items WHERE recommendation_id = $1 ORDER BY sort_order, created_at`,
        [req.params.id]
      ),
    ])

    res.json({ data: { ...result.rows[0], assets: assets.rows, budget_items: budgetItems.rows, action_items: actionItems.rows } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recommendation' })
  }
})

// POST /api/recommendations
router.post('/', requireAuth, async (req, res) => {
  const { client_id, assessment_answer_id, title, description, executive_summary,
          kind, type, priority, status, estimated_budget, estimated_hours, responsible_party,
          assigned_to, target_date, schedule_year, schedule_quarter } = req.body
  if (!client_id || !title) return res.status(400).json({ error: 'client_id and title are required' })
  // Map legacy/frontend type values to valid DB enum values
  const VALID_TYPES = ['remediation','improvement','maintenance','compliance','strategic']
  const safeType = VALID_TYPES.includes(type) ? type : 'improvement'
  try {
    const result = await db.query(
      `INSERT INTO recommendations (tenant_id, client_id, assessment_answer_id, title, description,
         executive_summary, kind, type, priority, status, estimated_budget, estimated_hours,
         responsible_party, assigned_to, target_date, schedule_year, schedule_quarter)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.tenant.id, client_id, assessment_answer_id || null, title, description || null,
       executive_summary || null, kind || 'recommendation', safeType, priority || 'medium', status || 'draft',
       estimated_budget || null, estimated_hours || null,
       responsible_party || 'msp', assigned_to || null, target_date || null,
       schedule_year || null, schedule_quarter || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[recommendations] create error:', err.message)
    res.status(500).json({ error: 'Failed to create recommendation' })
  }
})

// PATCH /api/recommendations/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, description, executive_summary, kind, type, priority, status,
          estimated_budget, estimated_hours, responsible_party, assigned_to,
          target_date, completed_date, schedule_year, schedule_quarter,
          at_ticket_id, at_ticket_number, at_ticket_title,
          at_opportunity_id, at_opportunity_number, at_opportunity_title } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendations SET
         title                = COALESCE($3, title),
         description          = COALESCE($4, description),
         executive_summary    = COALESCE($5, executive_summary),
         kind                 = COALESCE($6, kind),
         type                 = COALESCE($7, type),
         priority             = COALESCE($8, priority),
         status               = COALESCE($9, status),
         estimated_budget     = COALESCE($10, estimated_budget),
         estimated_hours      = COALESCE($11, estimated_hours),
         responsible_party    = COALESCE($12, responsible_party),
         assigned_to          = COALESCE($13, assigned_to),
         target_date          = COALESCE($14, target_date),
         completed_date       = COALESCE($15, completed_date),
         schedule_year        = COALESCE($16, schedule_year),
         schedule_quarter     = COALESCE($17, schedule_quarter),
         at_ticket_id         = COALESCE($18, at_ticket_id),
         at_ticket_number     = COALESCE($19, at_ticket_number),
         at_ticket_title      = COALESCE($20, at_ticket_title),
         at_opportunity_id    = COALESCE($21, at_opportunity_id),
         at_opportunity_number= COALESCE($22, at_opportunity_number),
         at_opportunity_title = COALESCE($23, at_opportunity_title),
         updated_at           = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, title, description, executive_summary,
       kind, type, priority, status, estimated_budget, estimated_hours,
       responsible_party, assigned_to, target_date, completed_date,
       schedule_year, schedule_quarter,
       at_ticket_id, at_ticket_number, at_ticket_title,
       at_opportunity_id, at_opportunity_number, at_opportunity_title]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update recommendation' })
  }
})

// DELETE /api/recommendations/:id
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'tam', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM recommendations WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete recommendation' })
  }
})

// ── Budget Items ──────────────────────────────────────────────────────────────

// POST /api/recommendations/:id/budget-items
router.post('/:id/budget-items', requireAuth, async (req, res) => {
  const { description, amount, billing_type, fee_type, sort_order } = req.body
  try {
    // Verify ownership
    const check = await db.query('SELECT id FROM recommendations WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant.id])
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' })
    const result = await db.query(
      `INSERT INTO recommendation_budget_items (recommendation_id, description, amount, billing_type, fee_type, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, description || '', parseFloat(amount) || 0, billing_type || 'fixed', fee_type || 'one_time', sort_order || 0]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create budget item' })
  }
})

// PATCH /api/recommendations/:id/budget-items/:itemId
router.patch('/:id/budget-items/:itemId', requireAuth, async (req, res) => {
  const { description, amount, billing_type, fee_type, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendation_budget_items SET
         description  = COALESCE($3, description),
         amount       = COALESCE($4, amount),
         billing_type = COALESCE($5, billing_type),
         fee_type     = COALESCE($6, fee_type),
         sort_order   = COALESCE($7, sort_order),
         updated_at   = NOW()
       WHERE id = $1 AND recommendation_id = $2 RETURNING *`,
      [req.params.itemId, req.params.id, description, amount !== undefined ? parseFloat(amount) : null,
       billing_type, fee_type, sort_order !== undefined ? sort_order : null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update budget item' })
  }
})

// DELETE /api/recommendations/:id/budget-items/:itemId
router.delete('/:id/budget-items/:itemId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM recommendation_budget_items WHERE id=$1 AND recommendation_id=$2', [req.params.itemId, req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete budget item' })
  }
})

// ── Asset Links ───────────────────────────────────────────────────────────────

// POST /api/recommendations/:id/assets — link asset
router.post('/:id/assets', requireAuth, async (req, res) => {
  const { asset_id, notes } = req.body
  if (!asset_id) return res.status(400).json({ error: 'asset_id required' })
  try {
    const result = await db.query(
      `INSERT INTO recommendation_assets (recommendation_id, asset_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (recommendation_id, asset_id) DO UPDATE SET notes = EXCLUDED.notes
       RETURNING *`,
      [req.params.id, asset_id, notes || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link asset' })
  }
})

// POST /api/recommendations/:id/assets/bulk
router.post('/:id/assets/bulk', requireAuth, async (req, res) => {
  const { asset_ids } = req.body
  if (!Array.isArray(asset_ids) || !asset_ids.length) return res.status(400).json({ error: 'asset_ids required' })
  try {
    for (const asset_id of asset_ids) {
      await db.query(
        `INSERT INTO recommendation_assets (recommendation_id, asset_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.id, asset_id]
      )
    }
    res.json({ status: 'ok', count: asset_ids.length })
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk link assets' })
  }
})

// DELETE /api/recommendations/:id/assets/:assetId — unlink asset
router.delete('/:id/assets/:assetId', requireAuth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM recommendation_assets WHERE recommendation_id = $1 AND asset_id = $2`,
      [req.params.id, req.params.assetId]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink asset' })
  }
})

// ── Action Items ──────────────────────────────────────────────────────────────

// POST /api/recommendations/:id/action-items
router.post('/:id/action-items', requireAuth, async (req, res) => {
  const { text, sort_order, due_date, assigned_to, status, notes } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  try {
    const check = await db.query('SELECT id FROM recommendations WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant.id])
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' })
    const result = await db.query(
      `INSERT INTO recommendation_action_items (recommendation_id, text, sort_order, due_date, assigned_to, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, text.trim(), sort_order || 0,
       due_date || null, assigned_to || null, status || 'open', notes || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create action item' })
  }
})

// PATCH /api/recommendations/:id/action-items/:itemId
router.patch('/:id/action-items/:itemId', requireAuth, async (req, res) => {
  const { text, completed, due_date, assigned_to, status, notes, at_ticket_number } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendation_action_items SET
         text             = COALESCE($3, text),
         completed        = COALESCE($4, completed),
         due_date         = CASE WHEN $5::text IS NOT NULL THEN $5::date ELSE due_date END,
         assigned_to      = CASE WHEN $6::text IS NOT NULL THEN NULLIF($6::text,'')::uuid ELSE assigned_to END,
         status           = COALESCE($7, status),
         notes            = COALESCE($8, notes),
         at_ticket_number = CASE WHEN $9::text IS NOT NULL THEN NULLIF($9::text,'') ELSE at_ticket_number END,
         updated_at       = NOW()
       WHERE id = $1 AND recommendation_id = $2 RETURNING *`,
      [req.params.itemId, req.params.id,
       text ?? null,
       completed !== undefined ? completed : null,
       due_date !== undefined ? due_date : null,
       assigned_to !== undefined ? assigned_to : null,
       status ?? null,
       notes ?? null,
       at_ticket_number ?? null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update action item' })
  }
})

// DELETE /api/recommendations/:id/action-items/:itemId
router.delete('/:id/action-items/:itemId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM recommendation_action_items WHERE id=$1 AND recommendation_id=$2', [req.params.itemId, req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete action item' })
  }
})

// POST /api/recommendations/:id/action-items/:itemId/at-ticket — create AT ticket for a rec action item
router.post('/:id/action-items/:itemId/at-ticket', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ai.*, c.autotask_company_id
       FROM recommendation_action_items ai
       JOIN recommendations r ON r.id = ai.recommendation_id
       JOIN clients c ON c.id = r.client_id
       WHERE ai.id=$1 AND r.id=$2 AND r.tenant_id=$3`,
      [req.params.itemId, req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    const item = result.rows[0]
    if (!item.autotask_company_id) return res.status(400).json({ error: 'Client does not have an Autotask company ID' })

    const ticket = await atApi.createTicket({
      companyId:    item.autotask_company_id,
      title:        req.body.title || item.text,
      description:  req.body.description || '',
      status:       req.body.status,
      ticketType:   req.body.ticketType,
      priority:     req.body.priority,
      queueId:      req.body.queueId,
      issueType:    req.body.issueType,
      subIssueType: req.body.subIssueType,
      categoryId:   req.body.categoryId,
      billingCodeId:req.body.billingCodeId,
      dueDate:      req.body.dueDate,
    })

    const ticketNum = ticket?.ticketNumber || null
    const updated = await db.query(
      `UPDATE recommendation_action_items SET at_ticket_number=$3, updated_at=NOW() WHERE id=$1 AND recommendation_id=$2 RETURNING *`,
      [req.params.itemId, req.params.id, ticketNum]
    )
    res.json({ data: updated.rows[0], ticket })
  } catch (err) {
    console.error('[rec action-item at-ticket] create error:', err.message)
    res.status(500).json({ error: err.response?.data?.errors?.[0]?.message || 'Failed to create Autotask ticket' })
  }
})

// DELETE /api/recommendations/:id/action-items/:itemId/at-ticket — unlink ticket
router.delete('/:id/action-items/:itemId/at-ticket', requireAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE recommendation_action_items SET at_ticket_number=NULL, updated_at=NOW() WHERE id=$1 AND recommendation_id=$2`,
      [req.params.itemId, req.params.id]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink ticket' })
  }
})

// ── Autotask Integration ──────────────────────────────────────────────────────

// GET /api/recommendations/at-search/tickets?rec_id=&q= OR ?client_id=&q=
router.get('/at-search/tickets', requireAuth, async (req, res) => {
  const { rec_id, client_id, q } = req.query
  try {
    let autotask_company_id
    if (rec_id) {
      const r = await db.query(
        `SELECT c.autotask_company_id FROM recommendations r JOIN clients c ON c.id = r.client_id WHERE r.id=$1 AND r.tenant_id=$2`,
        [rec_id, req.tenant.id]
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      autotask_company_id = r.rows[0].autotask_company_id
    } else if (client_id) {
      const r = await db.query(
        `SELECT autotask_company_id FROM clients WHERE id=$1 AND tenant_id=$2`,
        [client_id, req.tenant.id]
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      autotask_company_id = r.rows[0].autotask_company_id
    } else {
      return res.status(400).json({ error: 'rec_id or client_id required' })
    }
    if (!autotask_company_id) return res.status(400).json({ error: 'Client has no Autotask ID' })
    const tickets = await atApi.searchTickets({ companyId: autotask_company_id, q: q || '' })
    res.json({ data: tickets })
  } catch (err) {
    console.error('[at-search] tickets:', err.message)
    res.status(500).json({ error: 'Failed to search Autotask tickets' })
  }
})

// GET /api/recommendations/at-search/opportunities?rec_id=&q= OR ?client_id=&q=
router.get('/at-search/opportunities', requireAuth, async (req, res) => {
  const { rec_id, client_id, q } = req.query
  try {
    let autotask_company_id
    if (rec_id) {
      const r = await db.query(
        `SELECT c.autotask_company_id FROM recommendations r JOIN clients c ON c.id = r.client_id WHERE r.id=$1 AND r.tenant_id=$2`,
        [rec_id, req.tenant.id]
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      autotask_company_id = r.rows[0].autotask_company_id
    } else if (client_id) {
      const r = await db.query(
        `SELECT autotask_company_id FROM clients WHERE id=$1 AND tenant_id=$2`,
        [client_id, req.tenant.id]
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      autotask_company_id = r.rows[0].autotask_company_id
    } else {
      return res.status(400).json({ error: 'rec_id or client_id required' })
    }
    if (!autotask_company_id) return res.status(400).json({ error: 'Client has no Autotask ID' })
    const opps = await atApi.searchOpportunities({ companyId: autotask_company_id, q: q || '' })
    res.json({ data: opps })
  } catch (err) {
    console.error('[at-search] opportunities:', err.message)
    res.status(500).json({ error: 'Failed to search Autotask opportunities' })
  }
})

// GET /api/recommendations/at-picklists/tickets
router.get('/at-picklists/tickets', requireAuth, async (req, res) => {
  try {
    const data = await atApi.getTicketPicklists()
    res.json({ data })
  } catch (err) {
    console.error('[at-picklists] tickets:', err.message)
    res.status(500).json({ error: 'Failed to fetch Autotask ticket picklists' })
  }
})

// GET /api/recommendations/at-picklists/opportunities
router.get('/at-picklists/opportunities', requireAuth, async (req, res) => {
  try {
    const data = await atApi.getOpportunityPicklists()
    res.json({ data })
  } catch (err) {
    console.error('[at-picklists] opportunities:', err.message)
    res.status(500).json({ error: 'Failed to fetch Autotask opportunity picklists' })
  }
})

// POST /api/recommendations/:id/at-ticket — create AT ticket and link
router.post('/:id/at-ticket', requireAuth, async (req, res) => {
  try {
    const rec = await db.query(
      `SELECT r.*, c.autotask_company_id FROM recommendations r JOIN clients c ON c.id = r.client_id WHERE r.id=$1 AND r.tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    if (!rec.rows.length) return res.status(404).json({ error: 'Not found' })
    const r = rec.rows[0]
    if (!r.autotask_company_id) return res.status(400).json({ error: 'Client does not have an Autotask company ID' })

    const ticket = await atApi.createTicket({
      companyId:    r.autotask_company_id,
      title:        req.body.title || r.title,
      description:  req.body.description || r.description || '',
      status:       req.body.status,
      ticketType:   req.body.ticketType,
      priority:     req.body.priority,
      queueId:      req.body.queueId,
      issueType:    req.body.issueType,
      subIssueType: req.body.subIssueType,
      categoryId:   req.body.categoryId,
      billingCodeId:req.body.billingCodeId,
      dueDate:      req.body.dueDate,
    })

    const ticketId  = ticket?.id || ticket?.itemId
    const ticketNum = ticket?.ticketNumber || null
    const ticketTitle = ticket?.title || req.body.title || r.title

    const updated = await db.query(
      `UPDATE recommendations SET at_ticket_id=$3, at_ticket_number=$4, at_ticket_title=$5, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.tenant.id, ticketId, ticketNum, ticketTitle]
    )
    res.json({ data: updated.rows[0], ticket })
  } catch (err) {
    console.error('[at-ticket] create error:', err.message)
    res.status(500).json({ error: err.response?.data?.errors?.[0]?.message || 'Failed to create Autotask ticket' })
  }
})

// PATCH /api/recommendations/:id/at-ticket — link existing ticket
router.patch('/:id/at-ticket', requireAuth, async (req, res) => {
  const { at_ticket_id, at_ticket_number, at_ticket_title } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendations SET at_ticket_id=$3, at_ticket_number=$4, at_ticket_title=$5, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.tenant.id, at_ticket_id || null, at_ticket_number || null, at_ticket_title || null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link ticket' })
  }
})

// DELETE /api/recommendations/:id/at-ticket — unlink ticket
router.delete('/:id/at-ticket', requireAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE recommendations SET at_ticket_id=NULL, at_ticket_number=NULL, at_ticket_title=NULL, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink ticket' })
  }
})

// POST /api/recommendations/:id/at-opportunity — create AT opportunity and link
router.post('/:id/at-opportunity', requireAuth, async (req, res) => {
  try {
    const rec = await db.query(
      `SELECT r.*, c.autotask_company_id FROM recommendations r JOIN clients c ON c.id = r.client_id WHERE r.id=$1 AND r.tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    if (!rec.rows.length) return res.status(404).json({ error: 'Not found' })
    const r = rec.rows[0]
    if (!r.autotask_company_id) return res.status(400).json({ error: 'Client does not have an Autotask company ID' })

    const opp = await atApi.createOpportunity({
      companyId:          r.autotask_company_id,
      title:              req.body.title || r.title,
      status:             req.body.status,
      stage:              req.body.stage,
      categoryId:         req.body.categoryId,
      rating:             req.body.rating,
      source:             req.body.source,
      description:        req.body.description || r.description || '',
      probability:        req.body.probability,
      totalRevenue:       req.body.totalRevenue,
      cost:               req.body.cost,
      onetimeRevenue:     req.body.onetimeRevenue,
      monthlyRevenue:     req.body.monthlyRevenue,
      yearlyRevenue:      req.body.yearlyRevenue,
      estimatedCloseDate: req.body.estimatedCloseDate,
      startDate:          req.body.startDate,
    })

    const oppId  = opp?.id || opp?.itemId
    const oppNum = opp?.opportunityNumber || null
    const oppTitle = opp?.title || req.body.title || r.title

    const updated = await db.query(
      `UPDATE recommendations SET at_opportunity_id=$3, at_opportunity_number=$4, at_opportunity_title=$5, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.tenant.id, oppId, oppNum, oppTitle]
    )
    res.json({ data: updated.rows[0], opportunity: opp })
  } catch (err) {
    console.error('[at-opportunity] create error:', err.message)
    res.status(500).json({ error: err.response?.data?.errors?.[0]?.message || 'Failed to create Autotask opportunity' })
  }
})

// PATCH /api/recommendations/:id/at-opportunity — link existing opportunity
router.patch('/:id/at-opportunity', requireAuth, async (req, res) => {
  const { at_opportunity_id, at_opportunity_number, at_opportunity_title } = req.body
  try {
    const result = await db.query(
      `UPDATE recommendations SET at_opportunity_id=$3, at_opportunity_number=$4, at_opportunity_title=$5, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.tenant.id, at_opportunity_id || null, at_opportunity_number || null, at_opportunity_title || null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link opportunity' })
  }
})

// DELETE /api/recommendations/:id/at-opportunity — unlink opportunity
router.delete('/:id/at-opportunity', requireAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE recommendations SET at_opportunity_id=NULL, at_opportunity_number=NULL, at_opportunity_title=NULL, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink opportunity' })
  }
})

// ── Goal Linking ──────────────────────────────────────────────────────────────

// GET /api/recommendations/:id/goals — goals linked to this rec
router.get('/:id/goals', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.id, g.title, g.status, g.target_year, g.target_quarter, g.description
       FROM goal_initiatives gi
       JOIN goals g ON g.id = gi.goal_id
       WHERE gi.recommendation_id = $1 AND g.tenant_id = $2
       ORDER BY g.created_at DESC`,
      [req.params.id, req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch linked goals' })
  }
})

// POST /api/recommendations/:id/goals — link an existing goal
router.post('/:id/goals', requireAuth, async (req, res) => {
  const { goal_id } = req.body
  if (!goal_id) return res.status(400).json({ error: 'goal_id required' })
  try {
    await db.query(
      `INSERT INTO goal_initiatives (goal_id, recommendation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [goal_id, req.params.id]
    )
    res.status(201).json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to link goal' })
  }
})

// DELETE /api/recommendations/:id/goals/:goalId — unlink a goal
router.delete('/:id/goals/:goalId', requireAuth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM goal_initiatives WHERE goal_id=$1 AND recommendation_id=$2`,
      [req.params.goalId, req.params.id]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink goal' })
  }
})

module.exports = router
