const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as time, current_database() as db')
    const row = result.rows[0]

    const tables = await db.query(
      "SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )

    res.json({
      status: 'ok',
      service: 'predictiveit-align',
      version: '0.1.0',
      database: {
        connected: true,
        name: row.db,
        time: row.time,
        tables: parseInt(tables.rows[0].count),
      },
    })
  } catch (err) {
    res.status(500).json({
      status: 'error',
      service: 'predictiveit-align',
      database: { connected: false, error: err.message },
    })
  }
})

module.exports = router
