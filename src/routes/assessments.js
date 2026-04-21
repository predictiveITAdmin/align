const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

// ─── GET /api/assessments — list all assessments for tenant ──────────────────
router.get('/', requireAuth, async (req, res) => {
  const { client_id, status, assessment_type } = req.query
  try {
    let query = `
      SELECT a.*,
             c.name AS client_name,
             u.display_name AS conducted_by_name,
             t.name AS template_name,
             CASE WHEN a.template_id IS NOT NULL THEN
               (SELECT COUNT(*) FROM assessment_answers aa WHERE aa.assessment_id = a.id)
             ELSE
               (SELECT COUNT(*) FROM assessment_items ai WHERE ai.assessment_id = a.id AND ai.response_id IS NOT NULL)
             END AS answered_count,
             CASE WHEN a.template_id IS NOT NULL THEN
               (SELECT COUNT(*) FROM template_items ti WHERE ti.template_id = a.template_id AND ti.is_active = true)
             ELSE
               (SELECT COUNT(*) FROM assessment_items ai WHERE ai.assessment_id = a.id)
             END AS total_items,
             CASE WHEN a.template_id IS NOT NULL THEN
               (SELECT COUNT(*) FROM assessment_answers aa
                JOIN template_item_responses r ON r.id = aa.response_id
                WHERE aa.assessment_id = a.id AND r.is_aligned = false)
             ELSE
               (SELECT COUNT(*) FROM assessment_items ai
                JOIN standard_responses sr ON sr.id = ai.response_id
                WHERE ai.assessment_id = a.id AND sr.is_aligned = false)
             END AS misaligned_count
      FROM assessments a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.conducted_by
      LEFT JOIN assessment_templates t ON t.id = a.template_id
      WHERE a.tenant_id = $1`
    const params = [req.tenant.id]
    if (client_id) { params.push(client_id); query += ` AND a.client_id = $${params.length}` }
    if (status) { params.push(status); query += ` AND a.status = $${params.length}` }
    if (assessment_type) { params.push(assessment_type); query += ` AND a.assessment_type = $${params.length}::assessment_type` }
    query += ` ORDER BY a.created_at DESC`
    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[assessments] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch assessments' })
  }
})

// ─── GET /api/assessments/findings-summary ───────────────────────────────────
router.get('/findings-summary', requireAuth, async (req, res) => {
  try {
    const { client_id } = req.query
    if (!client_id) return res.status(400).json({ error: 'client_id required' })

    // Summary from standards-based assessments
    const stdSummary = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE ai.response_id IS NOT NULL) AS total_answered,
         COUNT(*) FILTER (WHERE ai.response_id IS NOT NULL AND sr.is_aligned = false) AS total_misaligned,
         COUNT(*) FILTER (WHERE ai.response_id IS NOT NULL AND sr.is_aligned = true) AS total_aligned
       FROM assessments a
       JOIN assessment_items ai ON ai.assessment_id = a.id
       LEFT JOIN standard_responses sr ON sr.id = ai.response_id
       WHERE a.client_id = $1 AND a.tenant_id = $2 AND a.status = 'completed'`,
      [client_id, req.tenant.id]
    )

    // Template-based summary
    const tplSummary = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE aa.response_id IS NOT NULL) AS total_answered,
         COUNT(*) FILTER (WHERE aa.response_id IS NOT NULL AND r.is_aligned = false) AS total_misaligned,
         COUNT(*) FILTER (WHERE aa.response_id IS NOT NULL AND r.is_aligned = true) AS total_aligned
       FROM assessments a
       JOIN assessment_answers aa ON aa.assessment_id = a.id
       LEFT JOIN template_item_responses r ON r.id = aa.response_id
       WHERE a.client_id = $1 AND a.tenant_id = $2 AND a.status = 'completed'`,
      [client_id, req.tenant.id]
    )

    const std = stdSummary.rows[0]
    const tpl = tplSummary.rows[0]

    // Per-assessment breakdown
    const byAssessment = await db.query(
      `SELECT a.id, a.name, a.assessment_type, a.overall_score, a.assessment_date, a.status,
              CASE WHEN a.template_id IS NOT NULL THEN 'template' ELSE 'standards' END AS mode
       FROM assessments a
       WHERE a.client_id = $1 AND a.tenant_id = $2
       ORDER BY a.created_at DESC`,
      [client_id, req.tenant.id]
    )

    res.json({
      total_answered: parseInt(std.total_answered || 0) + parseInt(tpl.total_answered || 0),
      total_misaligned: parseInt(std.total_misaligned || 0) + parseInt(tpl.total_misaligned || 0),
      total_aligned: parseInt(std.total_aligned || 0) + parseInt(tpl.total_aligned || 0),
      by_assessment: byAssessment.rows,
    })
  } catch (err) {
    console.error('[assessments] findings-summary error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/assessments/frameworks — list available frameworks with counts ─
router.get('/frameworks', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT sft.framework,
             count(DISTINCT sft.standard_id) AS standard_count,
             count(DISTINCT sft.standard_id) FILTER (WHERE s.status = 'approved') AS approved_count
      FROM standard_framework_tags sft
      JOIN standards s ON s.id = sft.standard_id
      WHERE s.tenant_id = $1 AND s.is_active = true
      GROUP BY sft.framework
      ORDER BY sft.framework
    `, [req.tenant.id])
    res.json({ data: r.rows })
  } catch (err) {
    console.error('[assessments] frameworks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch frameworks' })
  }
})

// ─── GET /api/assessments/review-cycle — what's due for review per client ────
router.get('/review-cycle', requireAuth, async (req, res) => {
  try {
    const { client_id } = req.query

    // Compute which standards are due for review per client
    // A standard is due when: NOW() > last_reviewed_at + review_frequency interval
    // Or if last_reviewed_at is NULL (never reviewed)
    let query = `
      SELECT c.id AS client_id, c.name AS client_name, c.review_cadence,
             ss.id AS domain_id, ss.name AS domain_name,
             s.id AS standard_id, s.name AS standard_name, s.priority, s.review_frequency,
             cs.last_reviewed_at, cs.is_applicable,
             CASE
               WHEN cs.last_reviewed_at IS NULL THEN true
               WHEN s.review_frequency = 'quarterly' AND cs.last_reviewed_at < NOW() - INTERVAL '3 months' THEN true
               WHEN s.review_frequency = 'semi_annual' AND cs.last_reviewed_at < NOW() - INTERVAL '6 months' THEN true
               WHEN s.review_frequency = 'annual' AND cs.last_reviewed_at < NOW() - INTERVAL '12 months' THEN true
               WHEN s.review_frequency = 'monthly' AND cs.last_reviewed_at < NOW() - INTERVAL '1 month' THEN true
               ELSE false
             END AS is_due,
             CASE
               WHEN cs.last_reviewed_at IS NULL THEN NULL
               WHEN s.review_frequency = 'quarterly' THEN cs.last_reviewed_at + INTERVAL '3 months'
               WHEN s.review_frequency = 'semi_annual' THEN cs.last_reviewed_at + INTERVAL '6 months'
               WHEN s.review_frequency = 'annual' THEN cs.last_reviewed_at + INTERVAL '12 months'
               WHEN s.review_frequency = 'monthly' THEN cs.last_reviewed_at + INTERVAL '1 month'
             END AS next_due_date
      FROM client_standards cs
      JOIN standards s ON s.id = cs.standard_id
      JOIN standard_categories sc ON sc.id = s.category_id
      LEFT JOIN standard_sections ss ON ss.id = sc.section_id
      JOIN clients c ON c.id = cs.client_id
      WHERE cs.is_applicable = true AND s.is_active = true AND s.tenant_id = $1
        AND s.review_frequency != 'never'`
    const params = [req.tenant.id]

    if (client_id) {
      params.push(client_id)
      query += ` AND cs.client_id = $${params.length}`
    }
    query += ` ORDER BY c.name, ss.sort_order, s.priority DESC, s.name`

    const result = await db.query(query, params)

    // Aggregate by client
    const byClient = {}
    for (const row of result.rows) {
      if (!byClient[row.client_id]) {
        byClient[row.client_id] = {
          client_id: row.client_id,
          client_name: row.client_name,
          review_cadence: row.review_cadence,
          total_applicable: 0,
          due_count: 0,
          never_reviewed: 0,
          overdue_high: 0,
          standards: []
        }
      }
      const client = byClient[row.client_id]
      client.total_applicable++
      if (row.is_due) client.due_count++
      if (!row.last_reviewed_at) client.never_reviewed++
      if (row.is_due && row.priority === 'high') client.overdue_high++
      if (row.is_due) {
        client.standards.push({
          standard_id: row.standard_id,
          standard_name: row.standard_name,
          domain_name: row.domain_name,
          priority: row.priority,
          review_frequency: row.review_frequency,
          last_reviewed_at: row.last_reviewed_at,
          next_due_date: row.next_due_date
        })
      }
    }

    res.json({ data: Object.values(byClient) })
  } catch (err) {
    console.error('[assessments] review-cycle error:', err.message)
    res.status(500).json({ error: 'Failed to fetch review cycle' })
  }
})

// ─── GET /api/assessments/:id — full assessment with structure + answers ─────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const assessment = await db.query(
      `SELECT a.*, c.name AS client_name, u.display_name AS conducted_by_name, t.name AS template_name
       FROM assessments a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN users u ON u.id = a.conducted_by
       LEFT JOIN assessment_templates t ON t.id = a.template_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!assessment.rows.length) return res.status(404).json({ error: 'Assessment not found' })
    const a = assessment.rows[0]

    if (a.template_id) {
      // Template-based: return sections → items → responses + current answers
      const sections = await db.query(
        `SELECT * FROM template_sections WHERE template_id = $1 ORDER BY sort_order, name`,
        [a.template_id]
      )
      const items = await db.query(
        `SELECT ti.*,
                aa.id AS answer_id,
                aa.response_id AS selected_response_id,
                aa.internal_notes,
                aa.public_notes,
                aa.answered_at,
                r.label AS selected_label,
                r.color_code AS selected_color,
                r.is_aligned AS selected_is_aligned
         FROM template_items ti
         LEFT JOIN assessment_answers aa ON aa.item_id = ti.id AND aa.assessment_id = $2
         LEFT JOIN template_item_responses r ON r.id = aa.response_id
         WHERE ti.template_id = $1 AND ti.is_active = true
         ORDER BY ti.sort_order`,
        [a.template_id, req.params.id]
      )
      const responses = await db.query(
        `SELECT r.* FROM template_item_responses r
         JOIN template_items ti ON ti.id = r.item_id
         WHERE ti.template_id = $1
         ORDER BY r.sort_order`,
        [a.template_id]
      )

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
      const sectionsWithItems = sections.rows.map(s => ({ ...s, items: itemsBySection[s.id] || [] }))

      return res.json({ data: { ...a, sections: sectionsWithItems } })
    }

    // Standards-based: return domain → category → standard → responses hierarchy
    const items = await db.query(
      `SELECT ai.*,
              s.name AS standard_name, s.description AS standard_description,
              s.priority, s.level_tier, s.delivery_method, s.review_frequency,
              s.question_text, s.business_impact, s.technical_rationale,
              s.evidence_examples,
              sc.id AS category_id, sc.name AS category_name, sc.sort_order AS cat_sort,
              ss.id AS domain_id, ss.name AS domain_name, ss.sort_order AS domain_sort,
              sr_sel.label AS selected_label, sr_sel.level AS selected_level,
              sr_sel.is_aligned AS selected_is_aligned, sr_sel.description AS selected_description,
              (ai.metadata->>'inherited_from_assessment_id')::uuid AS inherited_from_id,
              inherited_a.name   AS inherited_from_name,
              inherited_a.assessment_type AS inherited_from_type,
              (SELECT json_agg(json_build_object('framework', sft.framework, 'framework_reference', sft.framework_reference))
                 FROM standard_framework_tags sft WHERE sft.standard_id = s.id) AS framework_tags
       FROM assessment_items ai
       JOIN standards s ON s.id = ai.standard_id
       JOIN standard_categories sc ON sc.id = s.category_id
       LEFT JOIN standard_sections ss ON ss.id = sc.section_id
       LEFT JOIN standard_responses sr_sel ON sr_sel.id = ai.response_id
       LEFT JOIN assessments inherited_a ON inherited_a.id = (ai.metadata->>'inherited_from_assessment_id')::uuid
       WHERE ai.assessment_id = $1
       ORDER BY ss.sort_order NULLS LAST, sc.sort_order, s.name`,
      [req.params.id]
    )

    // Get all response options for the standards in this assessment
    const standardIds = [...new Set(items.rows.map(i => i.standard_id))]
    let responseOptions = []
    if (standardIds.length > 0) {
      const respResult = await db.query(
        `SELECT * FROM standard_responses WHERE standard_id = ANY($1) ORDER BY sort_order`,
        [standardIds]
      )
      responseOptions = respResult.rows
    }

    // Group responses by standard_id
    const responsesByStandard = {}
    for (const r of responseOptions) {
      if (!responsesByStandard[r.standard_id]) responsesByStandard[r.standard_id] = []
      responsesByStandard[r.standard_id].push(r)
    }

    // Build hierarchy: domains → categories → items
    const domainMap = new Map()
    for (const item of items.rows) {
      const domainKey = item.domain_id || 'uncategorized'
      if (!domainMap.has(domainKey)) {
        domainMap.set(domainKey, {
          domain_id: item.domain_id,
          domain_name: item.domain_name || 'Uncategorized',
          domain_sort: item.domain_sort || 999,
          categories: new Map()
        })
      }
      const domain = domainMap.get(domainKey)
      if (!domain.categories.has(item.category_id)) {
        domain.categories.set(item.category_id, {
          category_id: item.category_id,
          category_name: item.category_name,
          cat_sort: item.cat_sort,
          items: []
        })
      }
      domain.categories.get(item.category_id).items.push({
        ...item,
        responses: responsesByStandard[item.standard_id] || []
      })
    }

    // Convert to array
    const domains = [...domainMap.values()]
      .sort((a, b) => a.domain_sort - b.domain_sort)
      .map(d => ({
        ...d,
        categories: [...d.categories.values()].sort((a, b) => a.cat_sort - b.cat_sort)
      }))

    res.json({ data: { ...a, domains, item_count: items.rowCount } })
  } catch (err) {
    console.error('[assessments] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch assessment' })
  }
})

// ─── POST /api/assessments — create assessment ──────────────────────────────
router.post('/', requireAuth, requireRole('tenant_admin', 'vcio', 'tam'), async (req, res) => {
  const { client_id, name, template_id, notes, assessment_type, framework } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id is required' })

  const aType = assessment_type || 'ad_hoc'

  try {
    const clientCheck = await db.query(
      `SELECT id, name FROM clients WHERE id = $1 AND tenant_id = $2`,
      [client_id, req.tenant.id]
    )
    if (!clientCheck.rows.length) return res.status(404).json({ error: 'Client not found' })

    const defaultName = {
      onboarding_phase1: `Onboarding Phase 1 — Critical Standards`,
      onboarding_phase2: `Onboarding Phase 2 — Remaining Standards`,
      recurring_review: `Recurring Review — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      framework_gap:    framework ? `${framework} Gap Assessment` : 'Framework Gap Assessment',
      ad_hoc: 'Technology Alignment Assessment'
    }

    const metadata = aType === 'framework_gap' && framework ? { framework } : null

    const assessment = await db.query(
      `INSERT INTO assessments (tenant_id, client_id, name, template_id, conducted_by, status, summary, assessment_type, metadata)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7::assessment_type, $8) RETURNING *`,
      [req.tenant.id, client_id, name || defaultName[aType] || defaultName.ad_hoc,
       template_id || null, req.user.sub, notes || null, aType,
       metadata ? JSON.stringify(metadata) : null]
    )
    const assessmentId = assessment.rows[0].id

    if (template_id) {
      await db.query(
        `INSERT INTO assessment_answers (assessment_id, item_id)
         SELECT $1, ti.id FROM template_items ti
         WHERE ti.template_id = $2 AND ti.is_active = true
         ON CONFLICT (assessment_id, item_id) DO NOTHING`,
        [assessmentId, template_id]
      )
    } else if (aType === 'framework_gap') {
      // Framework gap: pull standards tagged with the framework (regardless of client_standards applicability)
      if (!framework) {
        return res.status(400).json({ error: 'framework is required for framework_gap assessment' })
      }
      await db.query(`
        INSERT INTO assessment_items (assessment_id, standard_id, client_standard_id, severity, notes)
        SELECT $1, s.id, cs.id, 'marginal', NULL
        FROM standards s
        JOIN standard_framework_tags sft ON sft.standard_id = s.id
        LEFT JOIN client_standards cs ON cs.standard_id = s.id AND cs.client_id = $2
        WHERE s.tenant_id = $3 AND s.is_active = true AND s.status IN ('approved', 'draft')
          AND sft.framework = $4
      `, [assessmentId, client_id, req.tenant.id, framework])
    } else {
      // Standards-based: populate from client_standards (only applicable)
      let standardsFilter = ''

      if (aType === 'onboarding_phase1') {
        standardsFilter = `AND s.priority = 'high'`
      } else if (aType === 'onboarding_phase2') {
        standardsFilter = `AND s.priority != 'high'`
      } else if (aType === 'recurring_review') {
        standardsFilter = `AND (
          cs.last_reviewed_at IS NULL
          OR (s.review_frequency = 'monthly' AND cs.last_reviewed_at < NOW() - INTERVAL '1 month')
          OR (s.review_frequency = 'quarterly' AND cs.last_reviewed_at < NOW() - INTERVAL '3 months')
          OR (s.review_frequency = 'semi_annual' AND cs.last_reviewed_at < NOW() - INTERVAL '6 months')
          OR (s.review_frequency = 'annual' AND cs.last_reviewed_at < NOW() - INTERVAL '12 months')
        )`
      }

      const insertResult = await db.query(`
        INSERT INTO assessment_items (assessment_id, standard_id, client_standard_id, severity, notes)
        SELECT $1, s.id, cs.id, 'marginal', NULL
        FROM client_standards cs
        JOIN standards s ON s.id = cs.standard_id
        WHERE cs.client_id = $2 AND cs.is_applicable = true
          AND s.is_active = true AND s.tenant_id = $3
          ${standardsFilter}
        ON CONFLICT DO NOTHING
      `, [assessmentId, client_id, req.tenant.id])

      if (insertResult.rowCount === 0) {
        let fallbackFilter = ''
        if (aType === 'onboarding_phase1') fallbackFilter = `AND s.priority = 'high'`
        else if (aType === 'onboarding_phase2') fallbackFilter = `AND s.priority != 'high'`

        await db.query(`
          INSERT INTO assessment_items (assessment_id, standard_id, severity, notes)
          SELECT $1, s.id, 'marginal', NULL
          FROM standards s
          WHERE s.tenant_id = $2 AND s.is_active = true AND s.status = 'approved'
            ${fallbackFilter}
        `, [assessmentId, req.tenant.id])
      }
    }

    // ─── ANSWER INHERITANCE ───────────────────────────────────────────────
    // Pre-fill response_id from the most recent prior assessment for this client + standard.
    // This gives "answer once, satisfy many" — answering an MFA standard in Operational
    // auto-populates in CMMC, NIST, ISO, etc. gap assessments.
    await db.query(`
      UPDATE assessment_items ai
      SET response_id = latest.response_id,
          answered_at = latest.answered_at,
          answered_by = latest.answered_by,
          severity    = latest.severity,
          metadata    = jsonb_set(COALESCE(ai.metadata, '{}'::jsonb),
                                  '{inherited_from_assessment_id}',
                                  to_jsonb(latest.assessment_id::text))
      FROM (
        SELECT DISTINCT ON (ai2.standard_id)
               ai2.standard_id, ai2.response_id, ai2.answered_at, ai2.answered_by,
               ai2.severity, ai2.assessment_id
        FROM assessment_items ai2
        JOIN assessments a2 ON a2.id = ai2.assessment_id
        WHERE a2.client_id = $2 AND a2.tenant_id = $3
          AND a2.id != $1
          AND ai2.response_id IS NOT NULL
        ORDER BY ai2.standard_id, ai2.answered_at DESC NULLS LAST
      ) AS latest
      WHERE ai.assessment_id = $1 AND ai.standard_id = latest.standard_id
        AND ai.response_id IS NULL
    `, [assessmentId, client_id, req.tenant.id])

    // Get item count
    const countResult = await db.query(
      `SELECT COUNT(*) as c FROM assessment_items WHERE assessment_id = $1`,
      [assessmentId]
    )

    res.status(201).json({
      data: { ...assessment.rows[0], item_count: parseInt(countResult.rows[0].c) }
    })
  } catch (err) {
    console.error('[assessments] create error:', err.message)
    res.status(500).json({ error: 'Failed to create assessment' })
  }
})

// ─── PUT /api/assessments/:id/items/:itemId — save response for a standard ──
router.put('/:id/items/:itemId', requireAuth, async (req, res) => {
  const { response_id, severity, notes, internal_notes, public_notes, vcio_findings, vcio_business_impact } = req.body
  try {
    const result = await db.query(
      `UPDATE assessment_items SET
         response_id       = COALESCE($3, response_id),
         severity          = COALESCE($4, severity),
         notes             = COALESCE($5, notes),
         internal_notes    = COALESCE($6, internal_notes),
         public_notes      = COALESCE($7, public_notes),
         vcio_findings     = COALESCE($8, vcio_findings),
         vcio_business_impact = COALESCE($9, vcio_business_impact),
         answered_by       = $10,
         answered_at       = NOW(),
         updated_at        = NOW()
       WHERE id = $1 AND assessment_id = $2 RETURNING *`,
      [req.params.itemId, req.params.id, response_id || null,
       severity || null, notes || null, internal_notes || null,
       public_notes || null, vcio_findings || null, vcio_business_impact || null,
       req.user.sub]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[assessments] item update error:', err.message)
    res.status(500).json({ error: 'Failed to update assessment item' })
  }
})

// ─── PUT /api/assessments/:id/answers/:itemId — save answer for template item
router.put('/:id/answers/:itemId', requireAuth, async (req, res) => {
  const { response_id, internal_notes, public_notes } = req.body
  try {
    const result = await db.query(
      `INSERT INTO assessment_answers (assessment_id, item_id, response_id, internal_notes, public_notes, answered_by, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (assessment_id, item_id) DO UPDATE SET
         response_id    = EXCLUDED.response_id,
         internal_notes = EXCLUDED.internal_notes,
         public_notes   = EXCLUDED.public_notes,
         answered_by    = EXCLUDED.answered_by,
         answered_at    = NOW(),
         updated_at     = NOW()
       RETURNING *`,
      [req.params.id, req.params.itemId, response_id || null, internal_notes || null, public_notes || null, req.user.sub]
    )
    res.json({ data: result.rows[0] })
  } catch (err) {
    console.error('[assessments] answer error:', err.message)
    res.status(500).json({ error: 'Failed to save answer' })
  }
})

// ─── PATCH /api/assessments/:id — update assessment name/status ─────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const { name, status } = req.body
  try {
    const result = await db.query(
      `UPDATE assessments SET
         name       = COALESCE($3, name),
         status     = COALESCE($4, status),
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenant.id, name, status]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Assessment not found' })
    res.json({ data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update assessment' })
  }
})

// ─── GET /api/assessments/:id/comparison — previous assessment answers ───────
router.get('/:id/comparison', requireAuth, async (req, res) => {
  try {
    const curr = await db.query(
      `SELECT client_id, template_id, assessment_type, created_at FROM assessments WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenant.id]
    )
    if (!curr.rows.length) return res.status(404).json({ error: 'Not found' })
    const { client_id, template_id, assessment_type } = curr.rows[0]

    if (template_id) {
      // Template comparison
      const prev = await db.query(
        `SELECT id, name, created_at FROM assessments
         WHERE client_id=$1 AND template_id=$2 AND tenant_id=$3 AND id != $4
         ORDER BY created_at DESC LIMIT 1`,
        [client_id, template_id, req.tenant.id, req.params.id]
      )
      if (!prev.rows.length) return res.json({ data: null })

      const answers = await db.query(
        `SELECT aa.item_id, r.label, r.color_code, r.is_aligned
         FROM assessment_answers aa
         JOIN template_item_responses r ON r.id = aa.response_id
         WHERE aa.assessment_id=$1`,
        [prev.rows[0].id]
      )
      const map = {}
      for (const a of answers.rows) map[a.item_id] = a
      return res.json({ data: map, previous_assessment: prev.rows[0] })
    }

    // Standards-based comparison: find previous assessment of same type for this client
    const prev = await db.query(
      `SELECT id, name, created_at, overall_score FROM assessments
       WHERE client_id=$1 AND tenant_id=$2 AND id != $3 AND template_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [client_id, req.tenant.id, req.params.id]
    )
    if (!prev.rows.length) return res.json({ data: null })

    const prevItems = await db.query(
      `SELECT ai.standard_id, sr.level, sr.label, sr.is_aligned
       FROM assessment_items ai
       LEFT JOIN standard_responses sr ON sr.id = ai.response_id
       WHERE ai.assessment_id = $1 AND ai.response_id IS NOT NULL`,
      [prev.rows[0].id]
    )
    const map = {}
    for (const item of prevItems.rows) map[item.standard_id] = item

    res.json({ data: map, previous_assessment: prev.rows[0] })
  } catch (err) {
    console.error('[assessments] comparison error:', err.message)
    res.status(500).json({ error: 'Failed to fetch comparison' })
  }
})

// ─── DELETE /api/assessments/:id ─────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'vcio', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM assessments WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete assessment' })
  }
})

// ─── POST /api/assessments/:id/complete — score and finalize ─────────────────
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const a = await db.query(`SELECT * FROM assessments WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    if (!a.rows.length) return res.status(404).json({ error: 'Assessment not found' })
    const assessment = a.rows[0]

    let avgScore = null
    let domainScores = {}

    if (assessment.template_id) {
      // Template-based weighted scoring (unchanged)
      const scoreData = await db.query(
        `SELECT ts.weight AS section_weight, ti.weight AS item_weight, r.is_aligned, r.color_code
         FROM assessment_answers aa
         JOIN template_items ti ON ti.id = aa.item_id
         JOIN template_sections ts ON ts.id = ti.section_id
         LEFT JOIN template_item_responses r ON r.id = aa.response_id
         WHERE aa.assessment_id = $1 AND aa.response_id IS NOT NULL`,
        [req.params.id]
      )

      if (scoreData.rows.length > 0) {
        const colorScore = { satisfactory: 100, acceptable_risk: 80, needs_attention: 40, at_risk: 0, not_applicable: null }
        let totalWeight = 0, weightedScore = 0
        for (const row of scoreData.rows) {
          const combinedWeight = (parseFloat(row.section_weight || 0) / 100) * (parseFloat(row.item_weight || 0) / 100) * 100
          const score = row.color_code ? colorScore[row.color_code] : (row.is_aligned ? 100 : 0)
          if (score !== null) {
            weightedScore += combinedWeight * score
            totalWeight += combinedWeight
          }
        }
        avgScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : null
      }
    } else {
      // Standards-based scoring using standard_responses
      const scoreData = await db.query(
        `SELECT ai.standard_id, ai.client_standard_id,
                sr.level, sr.is_aligned,
                s.priority, s.review_frequency,
                ss.id AS domain_id, ss.name AS domain_name
         FROM assessment_items ai
         JOIN standards s ON s.id = ai.standard_id
         JOIN standard_categories sc ON sc.id = s.category_id
         LEFT JOIN standard_sections ss ON ss.id = sc.section_id
         LEFT JOIN standard_responses sr ON sr.id = ai.response_id
         WHERE ai.assessment_id = $1`,
        [req.params.id]
      )

      const levelScore = {
        satisfactory: 100, acceptable_risk: 80, needs_attention: 40, at_risk: 0, not_applicable: null
      }
      const priorityWeight = { high: 3, medium: 2, low: 1 }

      let totalWeight = 0, weightedScore = 0
      const domainTotals = {}

      for (const row of scoreData.rows) {
        const score = row.level ? levelScore[row.level] : null
        const weight = priorityWeight[row.priority] || 1
        const domainKey = row.domain_id || 'other'

        if (!domainTotals[domainKey]) {
          domainTotals[domainKey] = { domain_name: row.domain_name || 'Other', totalWeight: 0, weightedScore: 0, count: 0, answered: 0 }
        }
        domainTotals[domainKey].count++

        if (score !== null) {
          weightedScore += weight * score
          totalWeight += weight
          domainTotals[domainKey].weightedScore += weight * score
          domainTotals[domainKey].totalWeight += weight
          domainTotals[domainKey].answered++
        }

        // Update last_reviewed_at on client_standards for answered items
        if (row.client_standard_id && row.level) {
          await db.query(
            `UPDATE client_standards SET last_reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [row.client_standard_id]
          )
        }
      }

      avgScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : null

      // Build domain scores
      for (const [domainId, d] of Object.entries(domainTotals)) {
        domainScores[domainId] = {
          domain_name: d.domain_name,
          score: d.totalWeight > 0 ? Math.round(d.weightedScore / d.totalWeight) : null,
          total: d.count,
          answered: d.answered
        }
      }
    }

    // Update assessment
    const result = await db.query(
      `UPDATE assessments SET
         status = 'completed',
         overall_score = $2,
         assessment_date = COALESCE(assessment_date, NOW()::date),
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3 RETURNING *`,
      [req.params.id, avgScore, req.tenant.id]
    )

    // Update client health score and domain scores
    if (result.rows.length && avgScore != null) {
      await db.query(
        `UPDATE clients SET
           health_score = $2,
           alignment_score_by_domain = COALESCE($3, alignment_score_by_domain),
           last_assessment_date = NOW()::date,
           updated_at = NOW()
         WHERE id = $1`,
        [assessment.client_id, avgScore, Object.keys(domainScores).length > 0 ? JSON.stringify(domainScores) : null]
      )
    }

    res.json({
      data: result.rows[0],
      domain_scores: domainScores
    })
  } catch (err) {
    console.error('[assessments] complete error:', err.message)
    res.status(500).json({ error: 'Failed to complete assessment' })
  }
})

module.exports = router
