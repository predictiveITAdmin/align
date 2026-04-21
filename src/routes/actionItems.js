const express = require('express')
const router  = express.Router()
const db      = require('../db')
const { requireAuth } = require('../middleware/auth')
const atApi   = require('../services/autotaskApiService')

// GET /api/action-items?client_id=
router.get('/', requireAuth, async (req, res) => {
  const { client_id } = req.query
  if (!client_id) return res.status(400).json({ error: 'client_id required' })
  try {
    const result = await db.query(`
      SELECT ai.*,
             u.display_name AS assigned_to_name,
             r.title AS recommendation_title, r.id AS recommendation_id,
             g.title AS goal_title, g.id AS goal_id_ref
      FROM client_action_items ai
      LEFT JOIN users u ON u.id = ai.assigned_to
      LEFT JOIN recommendations r ON r.id = ai.recommendation_id
      LEFT JOIN goals g ON g.id = ai.goal_id
      WHERE ai.tenant_id = $1 AND ai.client_id = $2
      ORDER BY ai.created_at DESC
    `, [req.tenant.id, client_id])
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[action-items] list:', err.message)
    res.status(500).json({ error: 'Failed to fetch action items' })
  }
})

// POST /api/action-items
router.post('/', requireAuth, async (req, res) => {
  const { client_id, text, status, due_date, assigned_to, notes, recommendation_id, goal_id } = req.body
  if (!client_id || !text?.trim()) return res.status(400).json({ error: 'client_id and text required' })
  try {
    const result = await db.query(`
      INSERT INTO client_action_items
        (tenant_id, client_id, text, status, due_date, assigned_to, notes, recommendation_id, goal_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.tenant.id, client_id, text.trim(), status || 'open',
        due_date || null, assigned_to || null, notes || null,
        recommendation_id || null, goal_id || null])
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[action-items] create:', err.message)
    res.status(500).json({ error: 'Failed to create action item' })
  }
})

// PATCH /api/action-items/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { text, status, completed, due_date, assigned_to, notes, recommendation_id, goal_id, at_ticket_number } = req.body
  try {
    const result = await db.query(`
      UPDATE client_action_items SET
        text              = COALESCE($3, text),
        status            = COALESCE($4, status),
        completed         = COALESCE($5, completed),
        due_date          = CASE WHEN $6::text IS NOT NULL THEN $6::date ELSE due_date END,
        assigned_to       = CASE WHEN $7::text IS NOT NULL THEN NULLIF($7::text,'')::uuid ELSE assigned_to END,
        notes             = COALESCE($8, notes),
        recommendation_id = CASE WHEN $9::text IS NOT NULL THEN $9::uuid ELSE recommendation_id END,
        goal_id           = CASE WHEN $10::text IS NOT NULL THEN $10::uuid ELSE goal_id END,
        at_ticket_number  = CASE WHEN $11::text IS NOT NULL THEN NULLIF($11::text,'') ELSE at_ticket_number END,
        updated_at        = NOW()
      WHERE id = $1 AND tenant_id = $2 RETURNING *
    `, [req.params.id, req.tenant.id,
        text ?? null, status ?? null,
        completed !== undefined ? completed : null,
        due_date !== undefined ? due_date : null,
        assigned_to !== undefined ? assigned_to : null,
        notes ?? null,
        recommendation_id !== undefined ? recommendation_id : null,
        goal_id !== undefined ? goal_id : null,
        at_ticket_number ?? null])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[action-items] patch:', err.message)
    res.status(500).json({ error: 'Failed to update action item' })
  }
})

// DELETE /api/action-items/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM client_action_items WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete action item' })
  }
})

// POST /api/action-items/:id/at-ticket — create AT ticket for a standalone action item
router.post('/:id/at-ticket', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ai.*, c.autotask_company_id
       FROM client_action_items ai
       JOIN clients c ON c.id = ai.client_id
       WHERE ai.id=$1 AND ai.tenant_id=$2`,
      [req.params.id, req.tenant.id]
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
      `UPDATE client_action_items SET at_ticket_number=$3, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.tenant.id, ticketNum]
    )
    res.json({ data: updated.rows[0], ticket })
  } catch (err) {
    console.error('[action-items at-ticket] create error:', err.message)
    res.status(500).json({ error: err.response?.data?.errors?.[0]?.message || 'Failed to create Autotask ticket' })
  }
})

// DELETE /api/action-items/:id/at-ticket — unlink ticket
router.delete('/:id/at-ticket', requireAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE client_action_items SET at_ticket_number=NULL, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink ticket' })
  }
})

module.exports = router
