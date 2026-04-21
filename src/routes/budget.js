/**
 * Budget Dashboard API
 *
 * Aggregates budget data from:
 *   1. recommendation_budget_items → via recommendations (schedule_year / client)
 *   2. budget_items → direct line items per client / fiscal year
 *
 * Endpoints:
 *   GET /api/budget/dashboard?year=2026&client_id=...
 *   GET /api/budget/clients?year=2026
 */

const express = require('express')
const router  = express.Router()
const db      = require('../db')

const CATEGORY_LABELS = {
  hardware:         'Hardware',
  software:         'Software',
  licensing:        'Licensing',
  labor:            'Labor',
  managed_services: 'Managed Services',
  consulting:       'Consulting',
  infrastructure:   'Infrastructure',
  security:         'Security',
  other:            'Other',
}

// ─── GET /api/budget/dashboard ────────────────────────────────────────────────
// Returns summary KPIs + quarterly breakdown + per-client table
router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id
    const year     = parseInt(req.query.year) || new Date().getFullYear()
    const clientId = req.query.client_id || null

    const clientFilter = clientId ? 'AND r.client_id = $3' : ''
    const biClientFilter = clientId ? 'AND bi.client_id = $3' : ''
    const params = clientId ? [tenantId, year, clientId] : [tenantId, year]

    // ── 1. Budget from recommendation_budget_items ──
    const recRows = await db.query(
      `SELECT
          r.client_id,
          c.name                                                           AS client_name,
          COALESCE(r.schedule_year, $2)                                    AS fiscal_year,
          COALESCE(r.schedule_quarter, 1)                                  AS fiscal_quarter,
          r.status,
          SUM(CASE WHEN rbi.fee_type = 'one_time'           THEN rbi.amount ELSE 0 END) AS one_time,
          SUM(CASE WHEN rbi.fee_type = 'recurring_monthly'  THEN rbi.amount ELSE 0 END) AS monthly,
          SUM(CASE WHEN rbi.fee_type = 'recurring_annual'   THEN rbi.amount ELSE 0 END) AS annual
       FROM recommendation_budget_items rbi
       JOIN recommendations r ON rbi.recommendation_id = r.id
       JOIN clients         c ON r.client_id = c.id
       WHERE r.tenant_id = $1
         AND COALESCE(r.schedule_year, $2) = $2
         ${clientFilter}
       GROUP BY r.client_id, c.name, r.schedule_year, r.schedule_quarter, r.status`,
      params
    )

    // ── 2. Direct budget_items ──
    const biRows = await db.query(
      `SELECT
          bi.client_id,
          c.name                                                                   AS client_name,
          bi.fiscal_year,
          bi.fiscal_quarter,
          bi.category,
          SUM(CASE WHEN bi.frequency = 'one_time'  THEN bi.amount * bi.quantity ELSE 0 END) AS one_time,
          SUM(CASE WHEN bi.frequency = 'monthly'   THEN bi.amount * bi.quantity ELSE 0 END) AS monthly,
          SUM(CASE WHEN bi.frequency = 'annual'    THEN bi.amount * bi.quantity ELSE 0 END) AS annual,
          SUM(CASE WHEN bi.is_approved             THEN bi.amount * bi.quantity ELSE 0 END) AS approved
       FROM budget_items bi
       JOIN clients c ON bi.client_id = c.id
       WHERE bi.tenant_id = $1
         AND bi.fiscal_year = $2
         ${biClientFilter}
       GROUP BY bi.client_id, c.name, bi.fiscal_year, bi.fiscal_quarter, bi.category`,
      params
    )

    // ── 3. Merge into per-client / per-quarter maps ──
    const clientMap = {}  // clientId → { name, quarters: {1..4}, totals }
    const byQuarter = { 1: { one_time: 0, monthly: 0, annual: 0 },
                        2: { one_time: 0, monthly: 0, annual: 0 },
                        3: { one_time: 0, monthly: 0, annual: 0 },
                        4: { one_time: 0, monthly: 0, annual: 0 } }
    const byCategory = {}
    let totalOneTime = 0, totalMonthly = 0, totalAnnual = 0, totalApproved = 0

    function ensureClient(id, name) {
      if (!clientMap[id]) {
        clientMap[id] = {
          client_id:   id,
          client_name: name,
          quarters:    { 1: { one_time: 0, monthly: 0, annual: 0 },
                         2: { one_time: 0, monthly: 0, annual: 0 },
                         3: { one_time: 0, monthly: 0, annual: 0 },
                         4: { one_time: 0, monthly: 0, annual: 0 } },
          one_time:    0,
          monthly:     0,
          annual:      0,
          approved:    0,
        }
      }
      return clientMap[id]
    }

    for (const r of recRows.rows) {
      const q   = parseInt(r.fiscal_quarter) || 1
      const ot  = parseFloat(r.one_time)  || 0
      const mo  = parseFloat(r.monthly)   || 0
      const an  = parseFloat(r.annual)    || 0
      const cl  = ensureClient(r.client_id, r.client_name)

      cl.quarters[q].one_time += ot
      cl.quarters[q].monthly  += mo
      cl.quarters[q].annual   += an
      cl.one_time += ot; cl.monthly += mo; cl.annual += an

      byQuarter[q].one_time += ot
      byQuarter[q].monthly  += mo
      byQuarter[q].annual   += an

      totalOneTime += ot; totalMonthly += mo; totalAnnual += an
      if (r.status === 'approved') totalApproved += ot + mo * 12 + an
    }

    for (const r of biRows.rows) {
      const q   = parseInt(r.fiscal_quarter) || 1
      const ot  = parseFloat(r.one_time)  || 0
      const mo  = parseFloat(r.monthly)   || 0
      const an  = parseFloat(r.annual)    || 0
      const ap  = parseFloat(r.approved)  || 0
      const cl  = ensureClient(r.client_id, r.client_name)

      cl.quarters[q].one_time += ot
      cl.quarters[q].monthly  += mo
      cl.quarters[q].annual   += an
      cl.one_time += ot; cl.monthly += mo; cl.annual += an
      cl.approved += ap

      byQuarter[q].one_time += ot
      byQuarter[q].monthly  += mo
      byQuarter[q].annual   += an

      totalOneTime  += ot; totalMonthly += mo; totalAnnual += an
      totalApproved += ap

      const cat = r.category || 'other'
      byCategory[cat] = (byCategory[cat] || 0) + ot + mo * 12 + an
    }

    // ── 4. Shape response ──
    const clients = Object.values(clientMap)
      .map(c => ({
        ...c,
        total: c.one_time + c.monthly * 12 + c.annual,
        quarters: Object.fromEntries(
          Object.entries(c.quarters).map(([q, v]) => [
            q,
            { ...v, total: v.one_time + v.monthly * 12 + v.annual },
          ])
        ),
      }))
      .sort((a, b) => b.total - a.total)

    const quarterly = [1, 2, 3, 4].map(q => ({
      quarter: q,
      label:   `Q${q}`,
      one_time: byQuarter[q].one_time,
      monthly:  byQuarter[q].monthly,
      annual:   byQuarter[q].annual,
      total:    byQuarter[q].one_time + byQuarter[q].monthly * 12 + byQuarter[q].annual,
    }))

    const categoryBreakdown = Object.entries(byCategory)
      .map(([key, total]) => ({ key, label: CATEGORY_LABELS[key] || key, total }))
      .sort((a, b) => b.total - a.total)

    res.json({
      year,
      summary: {
        total_one_time:  totalOneTime,
        total_monthly:   totalMonthly,
        total_annual:    totalAnnual,
        total_approved:  totalApproved,
        grand_total:     totalOneTime + totalMonthly * 12 + totalAnnual,
        client_count:    clients.length,
      },
      quarterly,
      clients,
      category_breakdown: categoryBreakdown,
    })
  } catch (err) {
    console.error('[budget] dashboard error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/budget/client/:clientId ────────────────────────────────────────
// Per-client budget breakdown: grouped by kind (Initiatives / Recommendations)
// and by category (Hardware, Software, …) from direct budget_items
router.get('/client/:clientId', async (req, res) => {
  try {
    const tenantId  = req.user?.tenant_id
    const clientId  = req.params.clientId
    const year      = parseInt(req.query.year) || new Date().getFullYear()
    const curMonth  = new Date().getMonth() + 1
    const curQ      = Math.ceil(curMonth / 3)

    const clientRes = await db.query(
      `SELECT id, name FROM clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    )
    if (!clientRes.rows[0]) return res.status(404).json({ error: 'Not found' })

    // ── Recommendations with budget items ──
    const recRows = await db.query(
      `SELECT r.id, r.title,
              COALESCE(r.kind, 'recommendation') AS kind,
              r.type, r.status, r.priority,
              r.schedule_year, r.schedule_quarter,
              COALESCE(r.estimated_budget, 0) AS estimated_budget,
              COALESCE(SUM(CASE WHEN rbi.fee_type='one_time'          THEN rbi.amount ELSE 0 END),0) AS one_time,
              COALESCE(SUM(CASE WHEN rbi.fee_type='recurring_monthly' THEN rbi.amount ELSE 0 END),0) AS monthly,
              COALESCE(SUM(CASE WHEN rbi.fee_type='recurring_annual'  THEN rbi.amount ELSE 0 END),0) AS annual
       FROM recommendations r
       LEFT JOIN recommendation_budget_items rbi ON rbi.recommendation_id = r.id
       WHERE r.tenant_id = $1 AND r.client_id = $2
         AND r.status NOT IN ('declined','completed')
       GROUP BY r.id
       ORDER BY COALESCE(r.kind,'recommendation'), r.schedule_year NULLS LAST, r.schedule_quarter NULLS LAST`,
      [tenantId, clientId]
    )

    // ── Direct budget items ──
    const biRows = await db.query(
      `SELECT bi.id, bi.category, bi.frequency,
              bi.amount * bi.quantity AS total,
              bi.fiscal_year, bi.fiscal_quarter, bi.is_approved,
              COALESCE(a.name, bi.name) AS display_name
       FROM budget_items bi
       LEFT JOIN assets a ON bi.asset_id = a.id
       WHERE bi.tenant_id = $1 AND bi.client_id = $2
       ORDER BY bi.category, bi.fiscal_year NULLS LAST, bi.fiscal_quarter NULLS LAST`,
      [tenantId, clientId]
    )

    // ── Period classifier ──
    // Returns: 'not_scheduled' | 'overdue' | 'q1'..'q4' | 'other_year'
    function periodKey(schedYear, schedQ) {
      if (!schedYear) return 'not_scheduled'
      if (schedYear < year) return 'overdue'
      if (schedYear === year) {
        const q = schedQ || 1
        if (q < curQ && year === new Date().getFullYear()) return 'overdue'
        return `q${q}`
      }
      return 'other_year'
    }

    const PERIOD_KEYS = ['not_scheduled', 'overdue', 'q1', 'q2', 'q3', 'q4']
    function emptyP() { return Object.fromEntries(PERIOD_KEYS.map(k => [k, 0])) }

    const CAT_LABELS = {
      hardware: 'Hardware', software: 'Software', licensing: 'Licensing',
      labor: 'Labor', managed_services: 'Managed Services', consulting: 'Consulting',
      infrastructure: 'Infrastructure', security: 'Security', other: 'Other',
    }

    const groupMap = {}
    function ensureGroup(key, label, order) {
      if (!groupMap[key]) groupMap[key] = { key, label, order, items: [], totals: emptyP() }
      return groupMap[key]
    }

    // ── Process recommendations ──
    for (const r of recRows.rows) {
      const kind = r.kind === 'initiative' ? 'initiative' : 'recommendation'
      const g    = ensureGroup(
        kind,
        kind === 'initiative' ? 'Initiatives' : 'Recommendations',
        kind === 'initiative' ? 0 : 1
      )
      const pk    = periodKey(r.schedule_year, r.schedule_quarter)
      const total = parseFloat(r.one_time) + parseFloat(r.monthly) * 12 + parseFloat(r.annual)
               || parseFloat(r.estimated_budget) || 0
      const periods = emptyP()
      if (PERIOD_KEYS.includes(pk)) periods[pk] = total

      g.items.push({
        id: r.id, name: r.title, status: r.status, priority: r.priority,
        schedule_year: r.schedule_year, schedule_quarter: r.schedule_quarter,
        periods, total,
      })
      for (const k of PERIOD_KEYS) g.totals[k] += periods[k]
    }

    // ── Process budget items ──
    for (const bi of biRows.rows) {
      const cat   = bi.category || 'other'
      const g     = ensureGroup(cat, CAT_LABELS[cat] || cat, 10)
      const pk    = periodKey(bi.fiscal_year, bi.fiscal_quarter)
      const total = parseFloat(bi.total) || 0
      const periods = emptyP()
      if (PERIOD_KEYS.includes(pk)) periods[pk] = total

      g.items.push({ id: bi.id, name: bi.display_name, periods, total })
      for (const k of PERIOD_KEYS) g.totals[k] += periods[k]
    }

    // ── Grand totals ──
    const grandTotals = emptyP()
    const groups = Object.values(groupMap).sort((a, b) => a.order - b.order)
    for (const g of groups) for (const k of PERIOD_KEYS) grandTotals[k] += g.totals[k]

    // ── Chart data ──
    const GROUP_COLORS = {
      initiative:     '#2563eb', // blue-600
      recommendation: '#60a5fa', // blue-400
      hardware:       '#f59e0b', // amber-500
      software:       '#8b5cf6', // violet-500
      licensing:      '#10b981', // emerald-500
      other:          '#6b7280', // gray-500
    }
    const chartData = PERIOD_KEYS.map(k => ({
      key: k,
      label: k === 'not_scheduled' ? 'Not Sched.' : k === 'overdue' ? 'Overdue' : k.toUpperCase(),
      total: grandTotals[k],
      segments: groups.map(g => ({
        key: g.key, label: g.label, value: g.totals[k], color: GROUP_COLORS[g.key] || '#9ca3af',
      })),
    }))

    res.json({
      client: clientRes.rows[0],
      year,
      current_quarter: curQ,
      groups,
      grand_totals: grandTotals,
      chart_data: chartData,
    })
  } catch (err) {
    console.error('[budget] client error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/budget/years ─────────────────────────────────────────────────────
// Returns years that have any budget data, plus surrounding years for tabs
router.get('/years', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id
    const curYear  = new Date().getFullYear()

    const recYears = await db.query(
      `SELECT DISTINCT COALESCE(r.schedule_year, $2) AS yr
       FROM recommendation_budget_items rbi
       JOIN recommendations r ON rbi.recommendation_id = r.id
       WHERE r.tenant_id = $1`,
      [tenantId, curYear]
    )
    const biYears = await db.query(
      `SELECT DISTINCT fiscal_year AS yr FROM budget_items WHERE tenant_id = $1`,
      [tenantId]
    )

    const dataYears = new Set([
      ...recYears.rows.map(r => r.yr),
      ...biYears.rows.map(r => r.yr),
    ])

    // Always include current year + next 3
    const tabs = new Set([curYear, curYear + 1, curYear + 2, curYear + 3, ...dataYears])
    res.json([...tabs].map(Number).sort())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
