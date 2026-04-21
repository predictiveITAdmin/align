const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  host: '10.168.2.46', port: 5432, database: 'align',
  user: 'n8n', password: '7fa2b0cbec402d3d0c2aa05b858e84f3fb5aa8d7bd3d508e'
})

async function run() {
  const sqlFile = process.argv[2] || path.join(__dirname, 'tam_migration_001.sql')
  const sql = fs.readFileSync(sqlFile, 'utf8')
  console.log(`Running migration: ${path.basename(sqlFile)}`)

  try {
    await pool.query(sql)
    console.log('Migration completed successfully.')
  } catch (err) {
    console.error('Migration FAILED:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

run()
