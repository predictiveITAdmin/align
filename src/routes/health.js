const express = require('express')
const router = express.Router()
const db = require('../db')

// Temporary migration endpoint — remove after running
router.get('/dbinit', async (req, res) => {
  try {
    const steps = []
    await db.query(`
      ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS hostname           TEXT,
        ADD COLUMN IF NOT EXISTS last_user          TEXT,
        ADD COLUMN IF NOT EXISTS ram_bytes          BIGINT,
        ADD COLUMN IF NOT EXISTS storage_bytes      BIGINT,
        ADD COLUMN IF NOT EXISTS storage_free_bytes BIGINT,
        ADD COLUMN IF NOT EXISTS cpu_description    TEXT,
        ADD COLUMN IF NOT EXISTS cpu_cores          SMALLINT
    `)
    steps.push('columns added')

    let r = await db.query(`UPDATE assets SET hostname = COALESCE(datto_rmm_data->>'hostname', autotask_data->>'rmmDeviceAuditHostname') WHERE hostname IS NULL`)
    steps.push('hostname backfill: ' + r.rowCount)

    r = await db.query(`UPDATE assets SET last_user = CASE WHEN datto_rmm_data->>'lastLoggedInUser' LIKE '%\\%' THEN SPLIT_PART(datto_rmm_data->>'lastLoggedInUser', '\\', 2) ELSE datto_rmm_data->>'lastLoggedInUser' END WHERE last_user IS NULL AND datto_rmm_data->>'lastLoggedInUser' IS NOT NULL AND datto_rmm_data->>'lastLoggedInUser' != ''`)
    steps.push('last_user backfill: ' + r.rowCount)

    r = await db.query(`UPDATE assets SET ram_bytes = NULLIF(autotask_data->>'rmmDeviceAuditMemoryBytes','')::BIGINT WHERE ram_bytes IS NULL AND autotask_data->>'rmmDeviceAuditMemoryBytes' IS NOT NULL AND autotask_data->>'rmmDeviceAuditMemoryBytes' NOT IN ('0','')`)
    steps.push('ram_bytes backfill: ' + r.rowCount)

    r = await db.query(`UPDATE assets SET storage_bytes = NULLIF(autotask_data->>'rmmDeviceAuditStorageBytes','')::BIGINT WHERE storage_bytes IS NULL AND autotask_data->>'rmmDeviceAuditStorageBytes' IS NOT NULL AND autotask_data->>'rmmDeviceAuditStorageBytes' NOT IN ('0','')`)
    steps.push('storage_bytes backfill: ' + r.rowCount)

    r = await db.query(`UPDATE assets SET is_active = false WHERE datto_rmm_device_id IS NOT NULL AND last_seen_at IS NOT NULL AND last_seen_at < NOW() - INTERVAL '60 days' AND (is_online = false OR is_online IS NULL)`)
    steps.push('stale inactive: ' + r.rowCount)

    res.json({ ok: true, steps })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
