const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/csat — list CSAT responses, filterable by client
router.get('/', async (req, res) => {
  const { client_id, rating, from_date, to_date } = req.query
  try {
    let query = `
      SELECT cr.*, c.name as client_name
      FROM csat_responses cr
      LEFT JOIN clients c ON c.id = cr.client_id
      WHERE cr.tenant_id = $1`
    const params = [req.tenant.id]

    if (client_id) { params.push(client_id); query += ` AND cr.client_id = $${params.length}` }
    if (rating) { params.push(rating); query += ` AND cr.rating = $${params.length}` }
    if (from_date) { params.push(from_date); query += ` AND cr.responded_at >= $${params.length}` }
    if (to_date) { params.push(to_date); query += ` AND cr.responded_at <= $${params.length}` }

    query += ` ORDER BY cr.responded_at DESC LIMIT 500`

    const result = await db.query(query, params)
    res.json({ data: result.rows, total: result.rowCount })
  } catch (err) {
    console.error('[csat] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch CSAT responses' })
  }
})

// GET /api/csat/summary — aggregate CSAT stats
router.get('/summary', async (req, res) => {
  const { client_id, period } = req.query
  try {
    const clientFilter = client_id ? 'AND cr.client_id = $2' : ''
    const params = client_id ? [req.tenant.id, client_id] : [req.tenant.id]

    const stats = await db.query(
      `SELECT
         count(*) as total_responses,
         count(*) FILTER (WHERE rating = 'gold') as gold,
         count(*) FILTER (WHERE rating = 'green') as green,
         count(*) FILTER (WHERE rating = 'yellow') as yellow,
         count(*) FILTER (WHERE rating = 'red') as red,
         ROUND(
           (count(*) FILTER (WHERE rating IN ('gold', 'green'))::numeric /
            NULLIF(count(*), 0) * 100), 1
         ) as happiness_pct,
         count(*) FILTER (WHERE comment IS NOT NULL AND comment != '') as with_comments
       FROM csat_responses cr
       WHERE cr.tenant_id = $1 ${clientFilter}
       ${period ? `AND cr.responded_at >= NOW() - INTERVAL '${period === '30d' ? '30 days' : period === '90d' ? '90 days' : '1 year'}'` : ''}`,
      params
    )

    res.json({ data: stats.rows[0] })
  } catch (err) {
    console.error('[csat] summary error:', err.message)
    res.status(500).json({ error: 'Failed to fetch CSAT summary' })
  }
})

module.exports = router
