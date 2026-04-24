const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// ─── Sections ─────────────────────────────────────────────────────────────────

// GET /api/standards/sections
router.get('/sections', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ss.*,
              (SELECT count(*) FROM standard_categories sc WHERE sc.section_id = ss.id) AS category_count,
              (SELECT count(*) FROM standards s JOIN standard_categories sc ON sc.id = s.category_id WHERE sc.section_id = ss.id AND s.tenant_id = $1) AS standard_count
       FROM standard_sections ss
       WHERE ss.tenant_id = $1
       ORDER BY ss.sort_order, ss.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[standards] sections error:', err.message)
    res.status(500).json({ error: 'Failed to fetch sections' })
  }
})

// POST /api/standards/sections
router.post('/sections', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, sort_order } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const result = await db.query(
      `INSERT INTO standard_sections (tenant_id, name, description, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, name, description || null, sort_order || 0]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create section' })
  }
})

// PATCH /api/standards/sections/:id
router.patch('/sections/:id', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE standard_sections SET
         name = COALESCE($3, name), description = COALESCE($4, description),
         sort_order = COALESCE($5, sort_order)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, description, sort_order]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Section not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update section' })
  }
})

// DELETE /api/standards/sections/:id
router.delete('/sections/:id', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  try {
    await db.query(`DELETE FROM standard_sections WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete section' })
  }
})

// ─── Categories ───────────────────────────────────────────────────────────────

// GET /api/standards/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sc.*,
              ss.name AS section_name,
              (SELECT count(*) FROM standards s WHERE s.category_id = sc.id) AS standard_count
       FROM standard_categories sc
       LEFT JOIN standard_sections ss ON ss.id = sc.section_id
       WHERE sc.tenant_id = $1
       ORDER BY ss.sort_order NULLS LAST, sc.sort_order, sc.name`,
      [req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[standards] categories error:', err.message)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// POST /api/standards/categories
router.post('/categories', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, icon, sort_order, section_id } = req.body
  try {
    const result = await db.query(
      `INSERT INTO standard_categories (tenant_id, name, description, icon, sort_order, section_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.tenant.id, name, description || null, icon || null, sort_order || 0, section_id || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[standards] create category error:', err.message)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// PATCH /api/standards/categories/:id
router.patch('/categories/:id', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { name, description, section_id, sort_order } = req.body
  try {
    const result = await db.query(
      `UPDATE standard_categories SET
         name = COALESCE($3, name), description = COALESCE($4, description),
         section_id = COALESCE($5, section_id), sort_order = COALESCE($6, sort_order)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, description, section_id, sort_order]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Category not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// ─── Standards ────────────────────────────────────────────────────────────────

// GET /api/standards/summary — quick counts grouped by domain
router.get('/summary', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ss.id AS domain_id, ss.name AS domain_name, ss.sort_order,
             COUNT(DISTINCT sc.id) AS category_count,
             COUNT(DISTINCT s.id) AS standard_count,
             COUNT(DISTINCT s.id) FILTER (WHERE s.priority = 'high') AS high_count,
             COUNT(DISTINCT s.id) FILTER (WHERE s.delivery_method = 'automated') AS automated_count
      FROM standard_sections ss
      LEFT JOIN standard_categories sc ON sc.section_id = ss.id
      LEFT JOIN standards s ON s.category_id = sc.id AND s.is_active = true AND s.tenant_id = $1
      WHERE ss.tenant_id = $1
      GROUP BY ss.id, ss.name, ss.sort_order
      ORDER BY ss.sort_order`, [req.tenant.id])
    res.json({ data: result.rows })
  } catch (err) {
    console.error('[standards] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch summary' })
  }
})

// GET /api/standards/:id/responses — get 5-level rubric for a standard
router.get('/:id/responses', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM standard_responses WHERE standard_id = $1 AND tenant_id = $2 ORDER BY sort_order`,
      [req.params.id, req.tenant.id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch responses' })
  }
})

// POST /api/standards/:id/responses — bulk upsert rubric levels
router.post('/:id/responses', requireAuth, requireRole('tenant_admin', 'vcio'), async (req, res) => {
  const { responses } = req.body
  if (!Array.isArray(responses)) return res.status(400).json({ error: 'responses array required' })
  try {
    const results = []
    for (const r of responses) {
      const result = await db.query(
        `INSERT INTO standard_responses (tenant_id, standard_id, level, label, description, is_aligned, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (standard_id, level) DO UPDATE SET
           label = EXCLUDED.label, description = EXCLUDED.description,
           is_aligned = EXCLUDED.is_aligned, sort_order = EXCLUDED.sort_order
         RETURNING *`,
        [req.tenant.id, req.params.id, r.level, r.label, r.description || null,
         r.is_aligned ?? false, r.sort_order ?? 0]
      )
      results.push(result.rows[0])
    }
    res.json({ data: results })
  } catch (err) {
    console.error('[standards] upsert responses error:', err.message)
    res.status(500).json({ error: 'Failed to upsert responses' })
  }
})

// GET /api/standards/:id/tags — get all tags grouped by type
router.get('/:id/tags', async (req, res) => {
  try {
    const [frameworks, verticals, tech] = await Promise.all([
      db.query('SELECT * FROM standard_framework_tags WHERE standard_id = $1', [req.params.id]),
      db.query('SELECT * FROM standard_vertical_tags WHERE standard_id = $1', [req.params.id]),
      db.query('SELECT * FROM standard_tech_tags WHERE standard_id = $1', [req.params.id]),
    ])
    res.json({ data: { frameworks: frameworks.rows, verticals: verticals.rows, tech: tech.rows } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags' })
  }
})

// POST /api/standards/:id/tags — add tag (body: {type, value})
router.post('/:id/tags', requireAuth, async (req, res) => {
  const { type, value } = req.body
  if (!type || !value) return res.status(400).json({ error: 'type and value required' })
  try {
    const table = type === 'framework' ? 'standard_framework_tags'
      : type === 'vertical' ? 'standard_vertical_tags'
      : type === 'tech' ? 'standard_tech_tags' : null
    if (!table) return res.status(400).json({ error: 'Invalid tag type' })
    const col = type === 'framework' ? 'framework' : type === 'vertical' ? 'vertical' : 'tech_tag'
    const result = await db.query(
      `INSERT INTO ${table} (standard_id, ${col}) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING *`,
      [req.params.id, value]
    )
    res.json({ data: result.rows[0] || { already_exists: true } })
  } catch (err) {
    res.status(500).json({ error: 'Failed to add tag' })
  }
})

// DELETE /api/standards/:id/tags/:type/:value — remove tag
router.delete('/:id/tags/:type/:value', requireAuth, async (req, res) => {
  const { type, value } = req.params
  try {
    const table = type === 'framework' ? 'standard_framework_tags'
      : type === 'vertical' ? 'standard_vertical_tags'
      : type === 'tech' ? 'standard_tech_tags' : null
    if (!table) return res.status(400).json({ error: 'Invalid tag type' })
    const col = type === 'framework' ? 'framework' : type === 'vertical' ? 'vertical' : 'tech_tag'
    await db.query(`DELETE FROM ${table} WHERE standard_id = $1 AND ${col} = $2`, [req.params.id, value])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove tag' })
  }
})

// GET /api/standards — list with optional filters
router.get('/', async (req, res) => {
  const { category_id, section_id, status, due_for_review, search,
          domain_id, framework, vertical, tech, priority, tier, delivery_method, is_universal } = req.query
  try {
    let query = `
      SELECT s.*, sc.name AS category_name, ss.name AS section_name,
             sc.review_frequency_months, ss.id AS domain_id
      FROM standards s
      JOIN standard_categories sc ON sc.id = s.category_id
      LEFT JOIN standard_sections ss ON ss.id = sc.section_id
      WHERE s.tenant_id = $1`
    const params = [req.tenant.id]

    if (category_id) { params.push(category_id); query += ` AND s.category_id = $${params.length}` }
    if (section_id || domain_id) {
      params.push(section_id || domain_id)
      query += ` AND sc.section_id = $${params.length}`
    }
    if (status) { params.push(status); query += ` AND s.status = $${params.length}` }
    if (due_for_review === 'true') {
      query += ` AND s.next_review_due IS NOT NULL AND s.next_review_due <= NOW()`
    }
    if (priority) { params.push(priority); query += ` AND s.priority = $${params.length}::standard_priority` }
    if (tier) { params.push(tier); query += ` AND s.level_tier = $${params.length}::standard_tier` }
    if (delivery_method) { params.push(delivery_method); query += ` AND s.delivery_method = $${params.length}::delivery_method` }
    if (is_universal === 'true') query += ` AND s.is_universal = true`
    if (is_universal === 'false') query += ` AND s.is_universal = false`
    if (framework) {
      params.push(framework)
      query += ` AND EXISTS (SELECT 1 FROM standard_framework_tags sft WHERE sft.standard_id = s.id AND sft.framework = $${params.length})`
    }
    if (vertical) {
      params.push(vertical)
      query += ` AND EXISTS (SELECT 1 FROM standard_vertical_tags svt WHERE svt.standard_id = s.id AND svt.vertical = $${params.length})`
    }
    if (tech) {
      params.push(tech)
      query += ` AND EXISTS (SELECT 1 FROM standard_tech_tags stt WHERE stt.standard_id = s.id AND stt.tech_tag = $${params.length})`
    }
    if (search) {
      params.push(`%${search}%`)
      query += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length} OR s.criteria ILIKE $${params.length})`
    }

    query += ` ORDER BY ss.sort_order NULLS LAST, sc.sort_order, sc.name, s.sort_order, s.name`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[standards] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch standards' })
  }
})

// GET /api/standards/:id — single standard
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, sc.name AS category_name, ss.name AS section_name
       FROM standards s
       JOIN standard_categories sc ON sc.id = s.category_id
       LEFT JOIN standard_sections ss ON ss.id = sc.section_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Standard not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch standard' })
  }
})

// POST /api/standards — create a standard
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { category_id, name, description, criteria, how_to_find, why_we_ask,
          why_we_ask_client_visible, severity_weight, sort_order, status,
          review_frequency, tags,
          priority, level_tier, delivery_method, is_universal, user_impact_tag,
          question_text, business_impact, technical_rationale } = req.body
  if (!category_id || !name) return res.status(400).json({ error: 'category_id and name are required' })
  try {
    // Compute next_review_due
    let nextReview = null
    if (review_frequency && review_frequency !== 'never') {
      nextReview = computeNextReview(review_frequency)
    }
    const result = await db.query(
      `INSERT INTO standards (tenant_id, category_id, name, description, criteria, how_to_find, why_we_ask,
         why_we_ask_client_visible, severity_weight, sort_order, status, created_by, review_frequency,
         next_review_due, tags,
         priority, level_tier, delivery_method, is_universal, user_impact_tag,
         question_text, business_impact, technical_rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *`,
      [req.tenant.id, category_id, name, description || null, criteria || null,
       how_to_find || null, why_we_ask || null,
       why_we_ask_client_visible || false, severity_weight || 1.0, sort_order || 0,
       status || 'draft', req.user?.display_name || req.user?.email || null,
       review_frequency || 'never', nextReview,
       tags ? (Array.isArray(tags) ? tags : [tags]) : [],
       priority || 'medium', level_tier || 'level_1', delivery_method || 'remote_human',
       is_universal || false, user_impact_tag || 'no_user_impact',
       question_text || null, business_impact || null, technical_rationale || null]
    )
    res.status(201).json({ data: result.rows[0] })
  } catch (err) {
    console.error('[standards] create error:', err.message)
    res.status(500).json({ error: 'Failed to create standard' })
  }
})

// PUT /api/standards/:id — full update
router.put('/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { name, description, criteria, how_to_find, why_we_ask, why_we_ask_client_visible,
          severity_weight, sort_order, is_active, status, category_id, review_frequency, tags,
          priority, level_tier, delivery_method, is_universal, user_impact_tag,
          question_text, business_impact, technical_rationale } = req.body
  try {
    let nextReview = null
    if (review_frequency && review_frequency !== 'never') {
      nextReview = computeNextReview(review_frequency)
    }
    const result = await db.query(
      `UPDATE standards SET
        name                     = COALESCE($3, name),
        description              = COALESCE($4, description),
        criteria                 = COALESCE($5, criteria),
        how_to_find              = COALESCE($6, how_to_find),
        why_we_ask               = COALESCE($7, why_we_ask),
        why_we_ask_client_visible= COALESCE($8, why_we_ask_client_visible),
        severity_weight          = COALESCE($9, severity_weight),
        sort_order               = COALESCE($10, sort_order),
        is_active                = COALESCE($11, is_active),
        status                   = COALESCE($12, status),
        category_id              = COALESCE($13, category_id),
        review_frequency         = COALESCE($14, review_frequency),
        next_review_due          = CASE WHEN $15::TEXT IS NOT NULL THEN $15::TIMESTAMPTZ ELSE next_review_due END,
        tags                     = COALESCE($16, tags),
        priority                 = COALESCE($17, priority),
        level_tier               = COALESCE($18, level_tier),
        delivery_method          = COALESCE($19, delivery_method),
        is_universal             = COALESCE($20, is_universal),
        user_impact_tag          = COALESCE($21, user_impact_tag),
        question_text            = COALESCE($22, question_text),
        business_impact          = COALESCE($23, business_impact),
        technical_rationale      = COALESCE($24, technical_rationale),
        updated_at               = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.tenant.id, name, description, criteria, how_to_find, why_we_ask,
       why_we_ask_client_visible, severity_weight, sort_order, is_active, status, category_id,
       review_frequency, nextReview ? nextReview.toISOString() : null,
       tags ? (Array.isArray(tags) ? tags : [tags]) : null,
       priority || null, level_tier || null, delivery_method || null,
       typeof is_universal === 'boolean' ? is_universal : null, user_impact_tag || null,
       question_text || null, business_impact || null, technical_rationale || null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Standard not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update standard' })
  }
})

// PATCH /api/standards/:id — partial update (for status changes, review completion)
router.patch('/:id', requireAuth, async (req, res) => {
  const { status, last_reviewed_at, review_frequency, next_review_due } = req.body
  try {
    let nextReview = next_review_due
    if (review_frequency && review_frequency !== 'never' && !next_review_due) {
      nextReview = computeNextReview(review_frequency).toISOString()
    }
    const result = await db.query(
      `UPDATE standards SET
         status           = COALESCE($3, status),
         last_reviewed_at = COALESCE($4, last_reviewed_at),
         review_frequency = COALESCE($5, review_frequency),
         next_review_due  = COALESCE($6::TIMESTAMPTZ, next_review_due),
         updated_at       = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, status, last_reviewed_at || null,
       review_frequency, nextReview || null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Standard not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to patch standard' })
  }
})

// POST /api/standards/:id/review — mark as reviewed and advance status
router.post('/:id/review', requireAuth, async (req, res) => {
  const { new_status } = req.body
  try {
    const std = await db.query('SELECT * FROM standards WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant.id])
    if (!std.rows.length) return res.status(404).json({ error: 'Not found' })
    const s = std.rows[0]
    const nextReview = s.review_frequency && s.review_frequency !== 'never'
      ? computeNextReview(s.review_frequency).toISOString() : null
    const result = await db.query(
      `UPDATE standards SET
         status = $3, last_reviewed_at = NOW(),
         next_review_due = $4, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, new_status || 'approved', nextReview]
    )
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark reviewed' })
  }
})

// ─── POST /api/standards/bulk-approve — approve many drafts at once ──────────
// Body: { section_id?: uuid, status?: 'draft', ids?: uuid[], new_status?: 'approved' }
// If section_id given → approve all drafts in that section
// If ids[] given → approve those specific ids
router.post('/bulk-approve', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  const { section_id, ids, new_status } = req.body
  const target = new_status || 'approved'

  try {
    let result
    if (Array.isArray(ids) && ids.length > 0) {
      result = await db.query(
        `UPDATE standards SET status = $3, last_reviewed_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1) AND tenant_id = $2 AND status = 'draft'
         RETURNING id`,
        [ids, req.tenant.id, target]
      )
    } else if (section_id) {
      result = await db.query(
        `UPDATE standards s SET status = $3, last_reviewed_at = NOW(), updated_at = NOW()
         FROM standard_categories sc
         WHERE s.category_id = sc.id
           AND sc.section_id = $1
           AND s.tenant_id = $2
           AND s.status = 'draft'
         RETURNING s.id`,
        [section_id, req.tenant.id, target]
      )
    } else {
      // No filter → approve ALL drafts in tenant (use with care)
      result = await db.query(
        `UPDATE standards SET status = $2, last_reviewed_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND status = 'draft'
         RETURNING id`,
        [req.tenant.id, target]
      )
    }
    res.json({ updated_count: result.rowCount, status: target })
  } catch (err) {
    console.error('[standards] bulk-approve error:', err.message)
    res.status(500).json({ error: 'Failed to bulk-approve' })
  }
})

// ─── Helper: compute next review date ─────────────────────────────────────────
function computeNextReview(frequency) {
  const now = new Date()
  switch (frequency) {
    case 'monthly':   now.setMonth(now.getMonth() + 1); break
    case 'quarterly': now.setMonth(now.getMonth() + 3); break
    case 'biannual':  now.setMonth(now.getMonth() + 6); break
    case 'annually':  now.setFullYear(now.getFullYear() + 1); break
    default: return null
  }
  return now
}

// ─── POST /api/standards/auto-map-all — run auto-map for ALL active clients ──
router.post('/auto-map-all', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    // 1. Get all active clients
    const clientsRes = await db.query(
      `SELECT id, vertical, frameworks_enabled, lob_apps
       FROM clients WHERE tenant_id = $1 AND is_active = true`,
      [req.tenant.id]
    )

    // 2. Get all approved universal standards
    const standardsRes = await db.query(
      `SELECT id, is_universal FROM standards
       WHERE tenant_id = $1 AND status = 'approved' AND is_active = true`,
      [req.tenant.id]
    )

    // 3. Get tag-based lookups
    const vertTagRes = await db.query('SELECT standard_id, vertical FROM standard_vertical_tags')
    const fwTagRes = await db.query('SELECT DISTINCT standard_id, framework FROM standard_framework_tags')
    const techTagRes = await db.query('SELECT DISTINCT standard_id, tech_tag FROM standard_tech_tags')

    // Build lookup maps
    const vertMap = {} // vertical -> [standard_ids]
    for (const r of vertTagRes.rows) {
      if (!vertMap[r.vertical]) vertMap[r.vertical] = []
      vertMap[r.vertical].push(r.standard_id)
    }
    const fwMap = {}
    for (const r of fwTagRes.rows) {
      if (!fwMap[r.framework]) fwMap[r.framework] = []
      fwMap[r.framework].push(r.standard_id)
    }
    const techMap = {}
    for (const r of techTagRes.rows) {
      if (!techMap[r.tech_tag]) techMap[r.tech_tag] = []
      techMap[r.tech_tag].push(r.standard_id)
    }

    let totalInserted = 0, totalUpdated = 0, clientsMapped = 0

    for (const client of clientsRes.rows) {
      const mappings = new Map()

      // Universal
      for (const std of standardsRes.rows) {
        if (std.is_universal) {
          mappings.set(std.id, { standard_id: std.id, source: 'universal' })
        }
      }

      // Vertical
      if (client.vertical && vertMap[client.vertical]) {
        for (const stdId of vertMap[client.vertical]) {
          if (!mappings.has(stdId)) mappings.set(stdId, { standard_id: stdId, source: 'vertical' })
        }
      }

      // Framework
      if (client.frameworks_enabled?.length) {
        for (const fw of client.frameworks_enabled) {
          if (fwMap[fw]) {
            for (const stdId of fwMap[fw]) {
              if (!mappings.has(stdId)) mappings.set(stdId, { standard_id: stdId, source: 'framework' })
            }
          }
        }
      }

      // Tech
      if (client.lob_apps?.length) {
        for (const app of client.lob_apps) {
          if (techMap[app]) {
            for (const stdId of techMap[app]) {
              if (!mappings.has(stdId)) mappings.set(stdId, { standard_id: stdId, source: 'tech' })
            }
          }
        }
      }

      if (mappings.size === 0) continue

      // Batch upsert
      let inserted = 0, updated = 0
      for (const [, m] of mappings) {
        const result = await db.query(`
          INSERT INTO client_standards (tenant_id, client_id, standard_id, is_applicable, applicability_source)
          VALUES ($1, $2, $3, true, $4::applicability_source)
          ON CONFLICT (client_id, standard_id) DO UPDATE SET
            is_applicable = CASE WHEN client_standards.applicability_source = 'manual' THEN client_standards.is_applicable ELSE true END,
            applicability_source = CASE WHEN client_standards.applicability_source = 'manual' THEN client_standards.applicability_source ELSE EXCLUDED.applicability_source END,
            updated_at = NOW()
          RETURNING (xmax = 0) AS is_new
        `, [req.tenant.id, client.id, m.standard_id, m.source])
        if (result.rows[0]?.is_new) inserted++
        else updated++
      }

      // Update count
      const countRes = await db.query(
        'SELECT count(*) FROM client_standards WHERE client_id = $1 AND is_applicable = true', [client.id]
      )
      await db.query('UPDATE clients SET standards_count = $2, updated_at = NOW() WHERE id = $1',
        [client.id, parseInt(countRes.rows[0].count)])

      totalInserted += inserted
      totalUpdated += updated
      clientsMapped++
    }

    res.json({
      status: 'ok',
      clients_mapped: clientsMapped,
      total_clients: clientsRes.rows.length,
      standards_inserted: totalInserted,
      standards_updated: totalUpdated,
    })
  } catch (err) {
    console.error('[standards] auto-map-all error:', err.message)
    res.status(500).json({ error: 'Failed to auto-map all clients' })
  }
})

module.exports = router
