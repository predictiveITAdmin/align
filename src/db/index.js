/**
 * Shared PostgreSQL connection pool.
 * Import this wherever you need DB access: const db = require('./db')
 */

const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'align',
  user:     process.env.PGUSER     || 'n8n',
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message)
})

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
}
