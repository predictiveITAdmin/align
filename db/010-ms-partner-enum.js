const db = require('../src/db')

async function migrate() {
  await db.query(`ALTER TYPE sync_source_type ADD VALUE IF NOT EXISTS 'ms_partner'`)
  console.log('[010] Added ms_partner to sync_source_type enum')
  process.exit(0)
}

migrate().catch(e => { console.error(e.message); process.exit(1) })
