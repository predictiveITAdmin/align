/**
 * Assessment Templates — Standards library management.
 * Templates → Sections → Items → Responses
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// ── LIST templates ────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*,
              u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM template_sections ts WHERE ts.template_id = t.id) AS section_count,
              (SELECT COUNT(*) FROM template_items ti WHERE ti.template_id = t.id) AS item_count
       FROM assessment_templates t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.tenant_id = $1
       ORDER BY t.is_default DESC, t.created_at DESC`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[templates] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch templates' })
  }
})

// ── GET template detail (sections + items + responses) ────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const tmpl = await db.query(
      `SELECT * FROM assessment_templates WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!tmpl.rows.length) return res.status(404).json({ error: 'Template not found' })

    const sections = await db.query(
      `SELECT * FROM template_sections WHERE template_id = $1 ORDER BY sort_order, name`,
      [req.params.id]
    )
    const items = await db.query(
      `SELECT * FROM template_items WHERE template_id = $1 ORDER BY sort_order, title`,
      [req.params.id]
    )
    const responses = await db.query(
      `SELECT r.* FROM template_item_responses r
       JOIN template_items ti ON ti.id = r.item_id
       WHERE ti.template_id = $1
       ORDER BY r.sort_order`,
      [req.params.id]
    )

    // nest items into sections, nest responses into items
    const responsesByItem = {}
    for (const r of responses.rows) {
      if (!responsesByItem[r.item_id]) responsesByItem[r.item_id] = []
      responsesByItem[r.item_id].push(r)
    }
    const itemsBySection = {}
    for (const item of items.rows) {
      item.responses = responsesByItem[item.id] || []
      if (!itemsBySection[item.section_id]) itemsBySection[item.section_id] = []
      itemsBySection[item.section_id].push(item)
    }
    const sectionsWithItems = sections.rows.map(s => ({
      ...s,
      items: itemsBySection[s.id] || [],
    }))

    res.json({ data: { ...tmpl.rows[0], sections: sectionsWithItems } })
  } catch (err) {
    console.error('[templates] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch template' })
  }
})

// ── CREATE template ───────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const result = await db.query(
      `INSERT INTO assessment_templates (tenant_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, name, description || null, req.user.sub]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[templates] create error:', err.message)
    res.status(500).json({ error: 'Failed to create template' })
  }
})

// ── UPDATE template ───────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { name, description, is_active, is_default } = req.body
  try {
    const result = await db.query(
      `UPDATE assessment_templates SET
         name        = COALESCE($3, name),
         description = COALESCE($4, description),
         is_active   = COALESCE($5, is_active),
         is_default  = COALESCE($6, is_default),
         updated_at  = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, description, is_active, is_default]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' })
  }
})

// ── DELETE template ───────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM assessment_templates WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found' })
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

// ── DUPLICATE template ────────────────────────────────────────────────────────
router.post('/:id/duplicate', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    const src = await db.query(
      `SELECT * FROM assessment_templates WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!src.rows.length) return res.status(404).json({ error: 'Template not found' })

    const newTmpl = await db.query(
      `INSERT INTO assessment_templates (tenant_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, src.rows[0].name + ' (Copy)', src.rows[0].description, req.user.sub]
    )
    const newId = newTmpl.rows[0].id

    // Duplicate sections
    const sections = await db.query(
      `SELECT * FROM template_sections WHERE template_id = $1 ORDER BY sort_order`,
      [req.params.id]
    )
    for (const sec of sections.rows) {
      const newSec = await db.query(
        `INSERT INTO template_sections (template_id, name, description, weight, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [newId, sec.name, sec.description, sec.weight, sec.sort_order]
      )
      const newSecId = newSec.rows[0].id

      // Duplicate items in this section
      const items = await db.query(
        `SELECT * FROM template_items WHERE section_id = $1 ORDER BY sort_order`,
        [sec.id]
      )
      for (const item of items.rows) {
        const newItem = await db.query(
          `INSERT INTO template_items (section_id, template_id, title, description, item_type, weight, scoring_instructions, remediation_tips, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [newSecId, newId, item.title, item.description, item.item_type, item.weight, item.scoring_instructions, item.remediation_tips, item.sort_order]
        )
        const newItemId = newItem.rows[0].id

        // Duplicate responses
        const resps = await db.query(
          `SELECT * FROM template_item_responses WHERE item_id = $1 ORDER BY sort_order`,
          [item.id]
        )
        for (const r of resps.rows) {
          await db.query(
            `INSERT INTO template_item_responses (item_id, label, color_code, description, sort_order, is_aligned)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [newItemId, r.label, r.color_code, r.description, r.sort_order, r.is_aligned]
          )
        }
      }
    }

    res.status(201).json({ data: newTmpl.rows[0] })
  } catch (err) {
    console.error('[templates] duplicate error:', err.message)
    res.status(500).json({ error: 'Failed to duplicate template' })
  }
})

// ── SECTIONS ──────────────────────────────────────────────────────────────────

router.post('/:id/sections', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM template_sections WHERE template_id = $1`,
      [req.params.id]
    )
    const result = await db.query(
      `INSERT INTO template_sections (template_id, name, description, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, name, description || null, maxOrder.rows[0].next]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create section' })
  }
})

router.patch('/:id/sections/:sectionId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { name, description, weight, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE template_sections SET
         name        = COALESCE($3, name),
         description = COALESCE($4, description),
         weight      = COALESCE($5, weight),
         sort_order  = COALESCE($6, sort_order),
         updated_at  = NOW()
       WHERE id = $1 AND template_id = $2 RETURNING *`,
      [req.params.sectionId, req.params.id, name, description, weight, sort_order]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Section not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update section' })
  }
})

router.delete('/:id/sections/:sectionId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM template_sections WHERE id = $1 AND template_id = $2`, [req.params.sectionId, req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete section' })
  }
})

// ── ITEMS ─────────────────────────────────────────────────────────────────────

router.post('/:id/sections/:sectionId/items', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { title, description, item_type, scoring_instructions, remediation_tips } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })
  try {
    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM template_items WHERE section_id = $1`,
      [req.params.sectionId]
    )
    const result = await db.query(
      `INSERT INTO template_items (section_id, template_id, title, description, item_type, scoring_instructions, remediation_tips, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.sectionId, req.params.id, title, description || null,
       item_type || 'multi_response', scoring_instructions || null, remediation_tips || null,
       maxOrder.rows[0].next]
    )

    // Auto-create default responses based on type
    const itemId = result.rows[0].id
    if (item_type === 'yes_no') {
      await db.query(
        `INSERT INTO template_item_responses (item_id, label, color_code, sort_order, is_aligned) VALUES
         ($1, 'Yes', 'satisfactory', 0, true),
         ($1, 'No', 'at_risk', 1, false),
         ($1, 'Not Applicable', 'not_applicable', 2, true)`,
        [itemId]
      )
    } else {
      await db.query(
        `INSERT INTO template_item_responses (item_id, label, color_code, sort_order, is_aligned) VALUES
         ($1, 'Satisfactory', 'satisfactory', 0, true),
         ($1, 'Needs Attention', 'needs_attention', 1, false),
         ($1, 'At Risk', 'at_risk', 2, false),
         ($1, 'Not Applicable', 'not_applicable', 3, true),
         ($1, 'Acceptable Risk', 'acceptable_risk', 4, true)`,
        [itemId]
      )
    }

    const full = await db.query(`SELECT * FROM template_items WHERE id = $1`, [itemId])
    const resps = await db.query(`SELECT * FROM template_item_responses WHERE item_id = $1 ORDER BY sort_order`, [itemId])
    res.status(201).json({ data: { ...full.rows[0], responses: resps.rows } })
  } catch (err) {
    console.error('[templates] create item error:', err.message)
    res.status(500).json({ error: 'Failed to create item' })
  }
})

router.patch('/:id/items/:itemId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { title, description, item_type, weight, scoring_instructions, remediation_tips, sort_order, is_active } = req.body
  try {
    const result = await db.query(
      `UPDATE template_items SET
         title                = COALESCE($3, title),
         description          = COALESCE($4, description),
         item_type            = COALESCE($5, item_type),
         weight               = COALESCE($6, weight),
         scoring_instructions = COALESCE($7, scoring_instructions),
         remediation_tips     = COALESCE($8, remediation_tips),
         sort_order           = COALESCE($9, sort_order),
         is_active            = COALESCE($10, is_active),
         updated_at           = NOW()
       WHERE id = $1 AND template_id = $2 RETURNING *`,
      [req.params.itemId, req.params.id, title, description, item_type, weight,
       scoring_instructions, remediation_tips, sort_order, is_active]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' })
    const resps = await db.query(`SELECT * FROM template_item_responses WHERE item_id = $1 ORDER BY sort_order`, [req.params.itemId])
    res.json({ data: { ...result.rows[0], responses: resps.rows } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' })
  }
})

router.delete('/:id/items/:itemId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM template_items WHERE id = $1 AND template_id = $2`, [req.params.itemId, req.params.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' })
  }
})

// ── BULK WEIGHT UPDATE ────────────────────────────────────────────────────────
// Body: { sections: [{id, weight, items: [{id, weight}]}] }
router.put('/:id/weights', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { sections } = req.body
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections array required' })
  try {
    for (const sec of sections) {
      await db.query(
        `UPDATE template_sections SET weight = $1, updated_at = NOW() WHERE id = $2 AND template_id = $3`,
        [sec.weight, sec.id, req.params.id]
      )
      if (Array.isArray(sec.items)) {
        for (const item of sec.items) {
          await db.query(
            `UPDATE template_items SET weight = $1, updated_at = NOW() WHERE id = $2 AND template_id = $3`,
            [item.weight, item.id, req.params.id]
          )
        }
      }
    }
    res.json({ status: 'ok' })
  } catch (err) {
    console.error('[templates] weights error:', err.message)
    res.status(500).json({ error: 'Failed to update weights' })
  }
})

// ── RESPONSES ─────────────────────────────────────────────────────────────────

router.post('/:id/items/:itemId/responses', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { label, color_code, description, is_aligned } = req.body
  if (!label) return res.status(400).json({ error: 'label is required' })
  try {
    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM template_item_responses WHERE item_id = $1`,
      [req.params.itemId]
    )
    const result = await db.query(
      `INSERT INTO template_item_responses (item_id, label, color_code, description, sort_order, is_aligned)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.itemId, label, color_code || 'satisfactory', description || null,
       maxOrder.rows[0].next, is_aligned ?? false]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create response' })
  }
})

router.patch('/:id/responses/:responseId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { label, color_code, description, sort_order, is_aligned } = req.body
  try {
    const result = await db.query(
      `UPDATE template_item_responses SET
         label       = COALESCE($2, label),
         color_code  = COALESCE($3, color_code),
         description = COALESCE($4, description),
         sort_order  = COALESCE($5, sort_order),
         is_aligned  = COALESCE($6, is_aligned)
       WHERE id = $1 RETURNING *`,
      [req.params.responseId, label, color_code, description, sort_order, is_aligned]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Response not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update response' })
  }
})

router.delete('/:id/responses/:responseId', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM template_item_responses WHERE id = $1`, [req.params.responseId])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete response' })
  }
})

module.exports = router
